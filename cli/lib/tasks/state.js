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

const getBinaryPkgPath = () => {
  const platform = os.platform()
  switch (platform) {
    case 'darwin': return path.join('Cypress.app', 'Contents', 'Resources', 'app', 'package.json')
    case 'linux': return path.join('Cypress', 'resources', 'app', 'package.json')
    case 'win32': return path.join('Cypress', 'resources', 'app', 'package.json')
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
const getBinaryDirectoryAsync = (version = util.pkgVersion()) => {
  return getCliStateContentsAsync()
  .tap(debug)
  .get('installDirectory')
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
  return getBinaryDirectoryAsync()
  .then((binaryDir) => path.join(binaryDir, 'binary_state.json'))
  .tap((binaryStatePath) => debug('path to binary_state.json file %s', binaryStatePath))
}

const getBinaryStateContentsAsync = () => {
  return getBinaryStatePath()
  .then(fs.readJsonAsync)
  .catch({ code: 'ENOENT' }, SyntaxError, () => {
    debug('could not read binary_state.json file')
    return {}
  })
}

const getCliStatePathAsync = () => {
  return Promise.resolve(path.join(getDistDirectory(), 'cli_state.json'))
  .tap((path) => debug('path to cli_state.json file %s', path))
}

const getCliStateContentsAsync = () => {
  return getCliStatePathAsync()
  .then(fs.readJsonAsync)
  .catch({ code: 'ENOENT' }, SyntaxError, () => {
    debug('could not read cli_state.json file')
    return {}
  })
}

const getInstalledVersionAsync = () => {
  return getCliStateContentsAsync()
  .tap(debug)
  .get('version')
  .catchReturn(null)
}

const getBinaryVerifiedAsync = () => {
  return getBinaryStateContentsAsync()
  .tap(debug)
  .get('verified')
}

const ensureBinaryDirectoryAsync = () => {
  return getBinaryDirectoryAsync()
  .then(fs.ensureDirAsync)
}

const clearCliStateAsync = () => {
  return getCliStatePathAsync()
  .tap((path) => debug('removing cli_state.json at', path))
  .then(fs.removeAsync)
}

const clearBinaryStateAsync = () => {
  return getBinaryDirectoryAsync()
  .then(fs.removeAsync)
}

const writeInstalledVersionAsync = (version) => {
  return getCliStateContentsAsync()
  .then((contents) => {
    return writeCliStateAsync(_.extend(contents, { version }))
  })
}

const writeInstallDirectoryAsync = (installDirectory) => {
  return getCliStateContentsAsync()
  .then((contents) => {
    return writeCliStateAsync(_.extend(contents, { installDirectory }))
  })
}

/**
 * @param {boolean} verified
 */
const writeVerifiedAsync = (verified) => {
  return getBinaryStateContentsAsync()
  .then((contents) => {
    return writeBinaryStateAsync(_.extend(contents, { verified }))
  })
}

const getPathToExecutable = (binaryDir) => {
  return path.join(binaryDir, getPlatformExecutable())
}

const getPathToExecutableDir = (binaryDir) => {
  return path.join(binaryDir, getPlatformExecutable().split('/')[0])
}

const getBinaryPkgVersionAsync = (binaryDir) => {
  const pathToPackageJson = path.join(binaryDir, getBinaryPkgPath())

  return fs.readJsonAsync(pathToPackageJson)
  .get('version')
}

const writeCliStateAsync = (contents) => {
  return getCliStatePathAsync()
  .tap((path) => debug('writing cli_state.json at', path))
  .then((path) => fs.outputJsonAsync(path, contents, {
    spaces: 2,
  }))
}
const writeBinaryStateAsync = (contents) => {
  return getBinaryStatePath()
  .then((path) => fs.outputJsonAsync(path, contents, {
    spaces: 2,
  }))
}


module.exports = {
  getDistDirectory,
  getPathToExecutableDir,
  getPathToExecutable,
  getInstalledVersionAsync,
  getCliStateContentsAsync,
  getCliStatePathAsync,
  getBinaryStateContentsAsync,
  getBinaryVerifiedAsync,
  getBinaryDirectoryAsync,
  getBinaryPkgVersionAsync,
  clearCliStateAsync,
  clearBinaryStateAsync,
  writeCliStateAsync,
  writeBinaryStateAsync,
  writeInstalledVersionAsync,
  writeInstallDirectoryAsync,
  writeVerifiedAsync,
  ensureBinaryDirectoryAsync,
}
