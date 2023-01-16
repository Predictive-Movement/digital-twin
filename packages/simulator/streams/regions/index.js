const { from, share, shareReplay } = require('rxjs')
const norrbotten = require('./norrbotten')
const skane = require('./skane')

const kommuner = require('../kommuner')

module.exports = (savedParams) => {
  const kommunerStream = kommuner.read(savedParams)
  // return from([norrbotten(kommunerStream), skane(kommunerStream)]).pipe(share())
  const skaneKommun = skane(kommunerStream)
  console.log('Skåne', typeof skaneKommun, skaneKommun.kommuner, kommunerStream)
  return from([skaneKommun]).pipe(shareReplay())
}
