require('../../spec_helper')

const os = require('os')
const path = require('path')
// const Promise = require('bluebird')

const fs = require(`${lib}/fs`)
const logger = require(`${lib}/logger`)
const state = require(`${lib}/tasks/state`)


let installationDir // = state.getInstallationDir()
let cliStatePath // = state.getInfoFilePath()

describe('lib/tasks/state', function () {
  beforeEach(function () {
    logger.reset()
    this.sandbox.stub(process, 'exit')

    return state.getCliStatePathAsync()
    .tap((path) => cliStatePath = path)
    .then(fs.removeAsync)
    .then(() => state.getBinaryDirectoryAsync())
    .tap((binaryDir) => installationDir = binaryDir)
    .then(fs.removeAsync)


    // this.ensureEmptyInstallationDir = () => {
    //   return fs.removeAsync(installationDir)
    //   .then(() => {
    //     return state.ensureBinaryDirectoryAsync()
    //   })
    // }
  })

  afterEach(function () {
    return fs.removeAsync(installationDir)
    .then(fs.ensureDirAsync(installationDir))
  })

  context('.clearCliStateAsync', function () {
    it('wipes out version info in cli_state.json', function () {
      return fs.outputJsonAsync(cliStatePath, { version: '5', install_directory: '/path/to/binary' })
      .then(() => {
        return state.clearCliStateAsync()
      })
      .then(() => {
        return fs.pathExistsAsync(cliStatePath)
      })
      .then((stateExists) => {
        expect(stateExists).to.eql(false)
      })
    })
  })

  context('.ensureInstallationDir', function () {
    beforeEach(function () {
      return fs.removeAsync(installationDir)
    })

    it('ensures directory exists', function () {
      return state.ensureInstallationDir().then(() => {
        return fs.statAsync(installationDir)
      })
    })
  })

  context('.getInstallationDir', function () {
    it('resolves path to installation directory', function () {
      expect(state.getInstallationDir()).to.equal(installationDir)
    })
  })

  context('.getInstalledVersionAsync', function () {
    beforeEach(function () {
      return this.ensureEmptyInstallationDir()
    })

    it('resolves version from version file when it exists', function () {
      return state.writeInstalledVersionAsync('2.0.48')
      .then(() => {
        return state.getInstalledVersionAsync()
      })
      .then((version) => {
        expect(version).to.equal('2.0.48')
      })
    })

    it('throws when version file does not exist', function () {
      return state.getInstalledVersionAsync()
      .catch(() => {})
    })
  })

  context('.getPathToExecutable', function () {
    it('resolves path on windows', function () {
      this.sandbox.stub(os, 'platform').returns('win32')
      expect(state.getPathToExecutable()).to.endWith('.exe')
    })
  })

  context('.getPathToUserExecutableDir', function () {
    it('resolves path on macOS', function () {
      this.sandbox.stub(os, 'platform').returns('darwin')
      expect(state.getPathToUserExecutableDir()).to.equal(path.join(installationDir, 'Cypress.app'))
    })

    it('resolves path on linux', function () {
      this.sandbox.stub(os, 'platform').returns('linux')
      expect(state.getPathToUserExecutableDir()).to.equal(path.join(installationDir, 'Cypress'))
    })

    it('resolves path on windows', function () {
      this.sandbox.stub(os, 'platform').returns('win32')
      expect(state.getPathToUserExecutableDir()).to.endWith('Cypress')
    })

    it('rejects on anything else', function () {
      this.sandbox.stub(os, 'platform').returns('unknown')
      expect(() => state.getPathToUserExecutableDir()).to.throw('Platform: "unknown" is not supported.')
    })
  })

  context('.writeInstalledVersionAsync', function () {
    beforeEach(function () {
      return this.ensureEmptyInstallationDir()
    })

    it('writes the version to the version file', function () {
      return state.writeInstalledVersionAsync('the version')
      .then(() => {
        return fs.readJsonAsync(cliStatePath).get('version')
      })
      .then((version) => {
        expect(version).to.equal('the version')
      })
    })
  })
})
