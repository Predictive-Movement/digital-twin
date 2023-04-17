const { from, shareReplay, mergeMap, merge, Subject, of } = require('rxjs')
const {
  map,
  groupBy,
  tap,
  filter,
  pairwise,
  mergeAll,
  share,
  toArray,
  catchError,
  switchMap,
  bufferTime,
  retryWhen,
  delay,
  take,
  scan,
  debounceTime,
  concatMap,
} = require('rxjs/operators')
const { busDispatch } = require('./dispatch/busDispatch')
const { isInsideCoordinates } = require('../lib/polygon')
const { clusterPositions } = require('./kmeans')
const { haversine } = require('./distance')
const { taxiDispatch } = require('./dispatch/taxiDispatch')
const { error, info } = require('./log')
const Booking = require('./models/booking')

const flattenProperty = (property) => (stream) =>
  stream.pipe(
    mergeMap((object) =>
      object[property].pipe(
        toArray(),
        map((arr) => ({
          ...object,
          [property]: arr,
        }))
      )
    )
  )

const busStopsGroupedOnKommun = (kommuner) => (stops) =>
  stops.pipe(
    groupBy(({ tripId }) => tripId),
    mergeMap((s) => s.pipe(toArray())),
    filter((stops) => stops.length > 1),
    mergeMap((stops) => {
      const firstStop = stops[0]
      const lastStop = stops[stops.length - 1]
      return kommuner.pipe(
        filter(({ geometry }) =>
          isInsideCoordinates(firstStop.position, geometry.coordinates)
        ),
        map(({ name }) => ({
          tripId: firstStop.tripId,
          stops,
          firstStop,
          lastStop,
          kommun: name,
        }))
      )
    }),
    groupBy(({ kommun }) => kommun),
    map((trips) => ({
      name: trips.key,
      trips,
    }))
  )

class Region {
  constructor({ id, name, geometry, stops, lineShapes, kommuner }) {
    this.id = id

    this.geometry = geometry
    this.name = name
    this.stops = stops
    this.lineShapes = lineShapes
    this.kommuner = kommuner // TODO: Rename to municipalities.

    /**
     * Static map objects.
     */

    this.measureStations = kommuner.pipe(
      mergeMap((kommun) => kommun.measureStations)
    )

    this.postombud = kommuner.pipe(mergeMap((kommun) => kommun.postombud))

    /**
     * Vehicle streams.
     */

    this.buses = kommuner.pipe(
      map((kommun) => kommun.buses),
      mergeAll()
    )

    this.cars = kommuner.pipe(mergeMap((kommun) => kommun.cars))

    this.taxis = kommuner.pipe(
      mergeMap((kommun) => kommun.cars),
      filter((car) => car.vehicleType === 'taxi')
    )

    /**
     * Transportable objects streams.
     */

    this.citizens = kommuner.pipe(mergeMap((kommun) => kommun.citizens))

    this.stopAssignments = stops.pipe(
      busStopsGroupedOnKommun(kommuner),
      map(({ name, trips }) => ({
        buses: this.buses.pipe(filter((bus) => bus.fleet.kommun.name === name)),
        trips,
      })),
      flattenProperty('buses'),
      flattenProperty('trips'),
      filter(({ buses, trips }) => buses.length && trips.length),
      mergeMap(({ buses, trips }) => busDispatch(buses, trips), 1), // try to find optimal plan x kommun at a time
      catchError((err) => error('stopAssignments', err)),
      retryWhen((errors) => errors.pipe(delay(1000), take(10))),
      mergeAll(),
      mergeMap(({ bus, stops }) =>
        from(stops).pipe(
          pairwise(),
          map(stopsToBooking),
          map((booking) => ({ bus, booking }))
        )
      ),
      catchError((err) => error('stopAssignments', err)),
      share()
    )

    this.manualBookings = new Subject()

    this.unhandledBookings = this.citizens.pipe(
      mergeMap((passenger) => passenger.bookings),
      filter((booking) => !booking.assigned),
      catchError((err) => error('unhandledBookings', err)),
      share()
    )

    /*
    // TODO: Move this to dispatch central:
    // TODO: add kmeans clustering to group bookings and cars by pickup
    // send those to vroom and get back a list of assignments
    // for each assignment, take the booking and dispatch it to the car / fleet */
    this.dispatchedBookings = merge(
      this.stopAssignments.pipe(
        mergeMap(({ bus, booking }) => bus.handleBooking(booking), 5),
        filter((booking) => !booking.assigned),
        catchError((err) => error('region stopAssignments', err)),
        share()
      ),
      this.taxis.pipe(
        scan((acc, taxi) => acc.push(taxi) && acc, []),
        debounceTime(1000),
        tap((cars) => info('region taxis', cars.length)),
        filter((taxis) => taxis.length > 0),
        mergeMap((taxis) =>
          merge(this.manualBookings, this.unhandledBookings).pipe(
            bufferTime(5000, null, 100),
            filter((bookings) => bookings.length > 0),
            tap((bookings) =>
              info('Clustering taxi bookings', bookings.length, taxis.length)
            ),
            switchMap((bookings) => {
              const clusters = Math.max(5, Math.ceil(bookings.length / 10))
              if (bookings.length < taxis.length || bookings.length < clusters)
                return of([{ center: bookings[0].position, items: bookings }])

              return clusterPositions(bookings, Math.max(5, clusters))
            }),
            mergeAll(),
            map(({ center, items: bookings }) => ({ center, bookings })),
            catchError((err) => error('taxi cluster err', err)),
            concatMap(({ center, bookings }) => {
              const nearestTaxis = takeNearest(taxis, center, 10).filter(
                (taxi) => taxi.canPickupMorePassengers()
              )
              return taxiDispatch(nearestTaxis, bookings).catch((err) => {
                error('Region -> Dispatched Bookings -> Taxi', err)
                bookings.forEach((booking) => this.manualBookings.next(booking))
                return of([])
              })
            }),
            filter((bookings) => bookings.length),
            mergeAll(),
            mergeMap(({ taxi, bookings }) =>
              from(bookings).pipe(
                // TODO: We have a bug here, the system tries to dispatch taxis that are already full.
                mergeMap((booking) => taxi.fleet.handleBooking(booking, taxi)),
                catchError((err) =>
                  error('Region -> Dispatched Bookings -> Taxis', err)
                )
              )
            ),
            retryWhen((errors) =>
              errors.pipe(
                tap((err) =>
                  error('region taxi error, retrying in 1s...', err)
                ),
                delay(1000)
              )
            )
          )
        ),
        catchError((err) => error('region taxiDispatch', err)),
        share()
      )
    )
    // Move this to passenger instead
    /*this.unhandledBookings.pipe(
      mergeMap((booking) => taxiDispatch(this.taxis, booking)),
      mergeAll()
    ).subscribe(() => {
      console.log("Thing")
    })*/

    /*    taxiDispatch(this.taxis, this.passengers).subscribe((e) => {
      e.map(({ taxi, steps }) => steps.map((step) => taxi.addInstruction(step)))
    }) */
  }
}

const takeNearest = (taxis, center, count) =>
  taxis
    .sort((a, b) => {
      const aDistance = haversine(a.position, center)
      const bDistance = haversine(b.position, center)
      return aDistance - bDistance
    })
    .slice(0, count)

const stopsToBooking = ([pickup, destination]) =>
  new Booking({
    pickup,
    destination,
    lineNumber: pickup.lineNumber ?? destination.lineNumber,
    type: 'busstop',
  })

module.exports = Region
