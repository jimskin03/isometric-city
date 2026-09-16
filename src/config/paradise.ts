export const PARADISE_CITY = {
  name: 'Paradise City',
  defaultCityName: 'Paradise City',
  description: 'Paradise City is a compact isometric city-building simulation in the CryptGreg universe.',
  storage: {
    // Keep the legacy IsoCity key values for now so existing local saves remain loadable.
    gameState: 'isocity-game-state',
    savedCityRestore: 'isocity-saved-city',
    savedCitiesIndex: 'isocity-saved-cities-index',
    savedCityPrefix: 'isocity-city-',
    spritePack: 'isocity-sprite-pack',
    dayNightMode: 'isocity-day-night-mode',
  },
} as const;