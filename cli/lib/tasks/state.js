const _ = require('lodash')
const os = require('os')
const path = require('path')
const debug = require('debug')('cypress:cli')
const Promise = require('bluebird')
const cachedir = require('cachedir')

const fs = require('../fs')
const util = require('../util')

const getPlatformExecutable = () => {
  const platform = os.platform()
  switch (platform) {
    case 'darwin': return 'Cypress.app/Contents/MacOS/Cypress'
    case 'linux': return 'Cypress/Cypress'
    case 'win32': return 'Cypress/Cypress.exe'
      // TODO handle this error using our standard
    default: throw new Error(`Platform: "${platform}" is not supported.`)
  }
}

/**
 * Get path to binary directory
 * @async
 * @param {string} version
 * @returns {Promise}
 */
const getBinaryDirectory = (version = util.pkgVersion()) => {
  return getCliStateContents()
  .tap(debug)
  .get('install_directory')
  .then((installDir) => {
    if (installDir) return installDir

    let cache_directory = cachedir('Cypress')

    if (process.env.CYPRESS_CACHE_DIRECTORY) {
      const envVarCacheDir = process.env.CYPRESS_CACHE_DIRECTORY
      debug('using env var CYPRESS_CACHE_DIRECTORY %s', envVarCacheDir)
      cache_directory = envVarCacheDir
    }
    return path.join(cache_directory, version)
  })
}

const getDistDirectory = () => {
  return path.join(__dirname, '..', '..', 'dist')
}

const getBinaryStatePath = () => {
  return getBinaryDirectory()
  .then((binaryDir) => path.join(binaryDir, 'binary_state.json'))
  .tap((binaryStatePath) => debug('path to binary_state.json file %s', binaryStatePath))
}

const getBinaryStateContents = () => {
  return getBinaryStatePath()
  .then(fs.readJsonAsync)
  .catch({ code: 'ENOENT' }, SyntaxError, () => {
    debug('could not read binary_state.json file')
    return {}
  })
}

const getCliStatePath = () => {
  return Promise.resolve(path.join(getDistDirectory(), 'cli_state.json'))
  .tap((path) => debug('path to cli_state.json file %s', path))
}

const getCliStateContents = () => {
  return getCliStatePath()
  .then(fs.readJsonAsync)
  .catch({ code: 'ENOENT' }, SyntaxError, () => {
    debug('could not read cli_state.json file')
    return {}
  })
}

const getInstalledVersion = () => {
  return getCliStateContents()
  .tap(debug)
  .get('version')
  .catchReturn(null)
}

const getBinaryVerified = () => {
  return getBinaryStateContents()
  .tap(debug)
  .get('verified')
}

const ensureBinaryDirectory = () => {
  return getBinaryDirectory()
  .then(fs.ensureDirAsync)
}

const clearCliState = () => {
  return getCliStatePath()
  .tap((path) => debug('removing cli_state.json at', path))
  .then(fs.removeAsync)
}

const clearBinaryState = () => {
  return getBinaryDirectory()
  .then(fs.removeAsync)
}

const writeInstalledVersion = (version) => {
  return getCliStateContents()
  .then((contents) => {
    return writeCliState(_.extend(contents, { version }))
  })
}

const writeInstallDirectory = (install_directory) => {
  return getCliStateContents()
  .then((contents) => {
    return writeCliState(_.extend(contents, { install_directory }))
  })
}

/**
 * @param {boolean} verified
 */
const writeVerified = (verified) => {
  return getBinaryStateContents()
  .then((contents) => {
    return writeBinaryState(_.extend(contents, { verified }))
  })
}

const getPathToExecutable = (binary_directory) => {
  return path.join(binary_directory, getPlatformExecutable())
}

const getPathToExecutableDir = (binary_directory) => {
  return path.join(binary_directory, getPlatformExecutable().split('/')[0])
}

const writeCliState = (contents) => {
  return getCliStatePath()
  .tap((path) => debug('writing cli_state.json at', path))
  .then((path) => fs.outputJsonAsync(path, contents, {
    spaces: 2,
  }))
}
const writeBinaryState = (contents) => {
  return getBinaryStatePath()
  .then((path) => fs.outputJsonAsync(path, contents, {
    spaces: 2,
  }))
}


module.exports = {
  getInstalledVersion,
  getCliStateContents,
  getCliStatePath,
  getDistDirectory,
  writeCliState,
  clearCliState,
  getBinaryStateContents,
  clearBinaryState,
  writeBinaryState,
  getBinaryVerified,
  getBinaryDirectory,
  ensureBinaryDirectory,
  getPathToExecutableDir,
  getPathToExecutable,
  writeInstalledVersion,
  writeInstallDirectory,
  writeVerified,
}
