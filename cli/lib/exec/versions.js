const util = require('../util')
const state = require('../tasks/state')

const getVersions = () => {
  return state.getInstalledVersionAsync()
  .then((binary) => {
    return {
      package: util.pkgVersion(),
      binary: binary || 'not installed',
    }
  })
}

module.exports = {
  getVersions,
}
