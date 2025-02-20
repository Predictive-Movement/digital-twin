# A Digital Twin for transport systems

## Quick start

The digital twin has a number of external dependencies. At the time of writing all of these dependencies are hosted by Iteam so that anyone can run the digital twin locally without too much hassle.

To run the digital twin locally, simply install the dependencies and then run the start command. All you need is Node.js v16.

```shell
npm ci
npm start
```

### Configuration

#### Simulator

There are a number of environment varibles that you can use to modify the behaviour of the simulator. The two most important ones to know are `LOG_LEVEL` and `REGIONS`.

- Use `LOG_LEVEL=debug` to make the simulator more verbose.
- Use `REGIONS=norrbotten` to limit the simulation to Norrbotten.
- Use `REGIONS=skane` to limit the simulation to Skåne.

#### Visualisation

There is a shared Mapbox Access token inside `packages/visualisation/.env`. If you want to use your own token you will need to generate a new one.

1. Go to (https://www.mapbox.com)[https://www.mapbox.com] and login or create an account.
2. Go to (https://account.mapbox.com)[https://account.mapbox.com] and create an Access token.
3. Copy the generated token to your clipboard.
4. Open the `packages/visualisation/.env` file.
5. Replace the token on the line starting with `VITE_MAPBOX_ACCESS_TOKEN=`.

> NOTE: if you lack a Mapbox Access token or if there is something wrong with it, you can still access the visualisation in a browser but the background will be a solid gray instead of a map.

## Background

This is a digital twin (agent based model) to both visualise transport data and generate new synthetic data which can be used to perform virtual experiments on transport optimizations such as systems level optimisation, drone deliveries, dynamic routes in public transport, co2 calculations, electric car adaption scenario planning etc.

## Screenshot

<img width="1198" alt="image" src="https://user-images.githubusercontent.com/395843/185745414-f05228a5-d03c-4745-9281-de0fdee414c2.png">

## Goals

These are the goals for the project:

1. Increase mobility in rural areas
2. Decrease the energy consumption in transport systems
3. Lower the cost for experimenting with new innovations
4. Reduce the dependencies on foreign and properiatary infrastructure
5. Privacy - by keeping all data locally and limit the amount of personal data stored

## Stack and dependencies

This project relies heavily on a set of open source softwares to solve particular problems. Included in the `skaffold.yaml` you will find all of these dependencies set up for you. To use the stack you need a Kubernetes cluster and run `skaffold run` which will install all dependencies for you.

1. Pelias - a geocoder/reverse geocoder software based on Elasticsearch. Used for getting proper addresses. Imports data from Lantmäteriet, this can be changed to any csv format.
2. OSRM - a routing software to find best routes and drive duration on the road network between two geopoints. Imports sweden data.
3. Vroom - a vehicle routing engine. By using OSRM as underlying routing engine and optimize a set of vehicles and shipments we can pick the plan that is most optimized for either duration or distance.
4. Open Trip Planner - Finding the fastest route between two points in the public transport network. Imports GTFS data from
5. Elasticsearch / Kibana - This is used to gather realtime statistics.
6. Opentiles - Self hosted tiles server to provide 3d vector maps.
7. GTFS-data from [Trafiklab](https://developer.trafiklab.se/)

/ TODO: Merge all Elasticsearch instances to one and also all OSM data to one source /

## How to contribute

This code is released as open source - which means you can create your own copy of this to use within your own fleet if you want to. You can also contribute by sending Pull Requests or issues to us and we will review and merge them. If you want to receive a closed source license, please contact Christian Landgren at Iteam.

### Branch and release strategy

- `main` — is a protected branch and requires PR:s to be changed, this is automatically synced with CI environment.
- `Releases` - To push a new release - create a new Release in the Github UI and when published, a new build will automatically be pushed to prod.

## License

Predictive Movement is free and open source software licensed by Iteam Solutions AB under the [LICENSE](AGPL license)
