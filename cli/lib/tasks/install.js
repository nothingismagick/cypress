const _ = require('lodash')
const la = require('lazy-ass')
const is = require('check-more-types')
const path = require('path')
const chalk = require('chalk')
const debug = require('debug')('cypress:cli')
const Listr = require('listr')
const verbose = require('@cypress/listr-verbose-renderer')
const Promise = require('bluebird')
const { stripIndent } = require('common-tags')
const fs = require('../fs')
const download = require('./download')
const util = require('../util')
const state = require('./state')
const unzip = require('./unzip')
const logger = require('../logger')

const alreadyInstalledMsg = (installedVersion, needVersion) => {
  logger.log(chalk.yellow(stripIndent`
    Cypress ${chalk.cyan(needVersion)} is already installed. Skipping installation.
  `))

  logger.log()

  logger.log(chalk.gray(stripIndent`
    Pass the ${chalk.white('--force')} option if you'd like to reinstall anyway.
  `))
}

const displayCompletionMsg = () => {
  logger.log()

  // check here to see if we are globally installed
  if (util.isInstalledGlobally()) {
    // if we are display a warning
    logger.warn(stripIndent`
      It looks like you\'ve installed Cypress globally.

      This will work, but it'\s not recommended.

      The recommended way to install Cypress is as a devDependency per project.

      You should probably run these commands:

        - ${chalk.cyan('npm uninstall -g cypress')}
        - ${chalk.cyan('npm install --save-dev cypress')}
    `)

    return
  }

  logger.log(
    chalk.yellow('You can now open Cypress by running:'),
    chalk.cyan(path.join('node_modules', '.bin', 'cypress'), 'open')
  )

  logger.log()

  logger.log(
    chalk.yellow('https://on.cypress.io/installing-cypress')
  )
}

const downloadAndUnzip = ({ version, installationDir, downloadDir }) => {
  let options = {
    version,
    installationDir,
    downloadDir,
  }

  // let the user know what version of cypress we're downloading!
  const message = chalk.yellow(`Installing Cypress ${chalk.gray(`(version: ${version})`)}`)
  logger.log(message)
  logger.log()

  const progessify = (task, title) => {
    // return higher order function
    return (percentComplete, remaining) => {
      percentComplete = chalk.white(` ${percentComplete}%`)

      // pluralize seconds remaining
      remaining = chalk.gray(`${remaining}s`)

      util.setTaskTitle(
        task,
        util.titleize(title, percentComplete, remaining),
        rendererOptions.renderer
      )
    }
  }

  // if we are running in CI then use
  // the verbose renderer else use
  // the default
  const rendererOptions = {
    renderer: util.isCi() ? verbose : 'default',
  }

  const tasks = new Listr([
    {
      title: util.titleize('Downloading Cypress'),
      task: (ctx, task) => {
        // as our download progresses indicate the status
        options.onProgress = progessify(task, 'Downloading Cypress')

        return download.start(options)
        .then(({ downloadDestination, downloaded }) => {
          // save the download destination for unzipping
          debug(`finished downloading file: ${downloadDestination}`)
          options.downloadDestination = downloadDestination
          ctx.downloaded = downloaded

          util.setTaskTitle(
            task,
            util.titleize(chalk.green('Downloaded Cypress')),
            rendererOptions.renderer
          )
        })
      },
    },
    {
      title: util.titleize('Unzipping Cypress'),
      task: (ctx, task) => {
        // as our unzip progresses indicate the status
        options.onProgress = progessify(task, 'Unzipping Cypress')

        return unzip.start(options)
        .then(() => {
          util.setTaskTitle(
            task,
            util.titleize(chalk.green('Unzipped Cypress')),
            rendererOptions.renderer
          )
        })
      },
    },
    {
      title: util.titleize('Finishing Installation'),
      task: (ctx, task) => {
        const { downloadDestination, downloadDir } = options
        la(is.unemptyString(downloadDir), 'missing download destination', options)
        la(is.bool(ctx.downloaded), 'missing downloaded flag', ctx)

        const cleanup = () => {
          if (ctx.downloaded) {
            debug('removing zip file %s', downloadDestination)
            return fs.removeAsync(downloadDestination)
          }
          debug('not removing file %s', downloadDestination)
          debug('because it was not downloaded (probably was local file already)')
          return Promise.resolve()
        }

        return cleanup()
        .then(() => {
          const dir = state.getPathToExecutableDir(installationDir)
          debug('finished installation in', dir)

          util.setTaskTitle(
            task,
            util.titleize(chalk.green('Finished Installation'), chalk.gray(dir)),
            rendererOptions.renderer
          )
        })
      },
    },
  ], rendererOptions)

  // start the tasks!
  return Promise.resolve(tasks.run())
}

const start = (options = {}) => {
  if (process.env.CYPRESS_SKIP_BINARY_INSTALL) {
    logger.log(
      chalk.yellow('Skipping binary installation. Env var \'CYPRESS_SKIP_BINARY_INSTALL\' was found.')
    )
    return Promise.resolve()
  }

  debug('installing with options %j', options)

  _.defaults(options, {
    force: false,
  })

  let needVersion = util.pkgVersion()
  debug('version in package.json is', needVersion)

  // let this env var reset the binary version we need
  if (process.env.CYPRESS_BINARY_VERSION) {
    const envVarVersion = process.env.CYPRESS_BINARY_VERSION

    // if this doesn't match the expected version
    // then print warning to the user
    if (envVarVersion !== needVersion) {
      debug('using env var CYPRESS_BINARY_VERSION %s', needVersion)
      logger.log(
        chalk.yellow(stripIndent`
          Forcing a binary version different than the default.

          The CLI expected to install version: ${chalk.cyan(needVersion)}

          Instead we will install version: ${chalk.cyan(envVarVersion)}

          Note: there is no guarantee these versions will work properly together.
        `)
      )
      logger.log('')

      // reset the version to the env var version
      needVersion = envVarVersion
    }
  }

  return state.getInstalledVersionAsync()
  .then((installedVersion) => {

    if (!installedVersion) {
      debug('no version in cli state')
      return true
    }

    debug('installed version is', installedVersion, 'version needed is', needVersion)

    if (options.force) {
      return state.clearCliStateAsync()
      .thenReturn(true)
    }

    if (installedVersion === needVersion) {
      // our version matches, tell the user this is a noop
      alreadyInstalledMsg(installedVersion, needVersion)

      return false
    }

    logger.warn(stripIndent`
      Installed version ${chalk.cyan(`(${installedVersion})`)} does not match needed version ${chalk.cyan(`(${needVersion})`)}.
    `)

    logger.log()

    return true
  })
  .then((shouldInstall) => {
    // noop if we've been told not to download
    if (!shouldInstall) {
      debug('Not downloading or installing binary')
      return
    }

    // see if version supplied is a path to a binary
    return fs.pathExistsAsync(needVersion)
    .then((exists) => {
      if (exists) {
        return needVersion
      }

      const possibleFile = util.formAbsolutePath(needVersion)
      debug('checking local file', possibleFile, 'cwd', process.cwd())

      return fs.pathExistsAsync(possibleFile)
      .then((exists) => {
        // if this exists return the path to it
        // else false
        return exists ? possibleFile : false
      })
    })
    .then((pathToLocalFile) => {
      if (pathToLocalFile) {
        debug('found local file at', needVersion)
        debug('skipping download')

        return state.writeInstallDirectoryAsync(pathToLocalFile)
        .then(() => state.writeInstalledVersionAsync(needVersion))
        .thenReturn(false)
      }

      return state.getBinaryDirectoryAsync(needVersion)
      .then((installationDir) => {
        return fs.pathExistsAsync(path.join(installationDir, 'binary_state.json'))
        .then((exists) => ({ installationDir, alreadyInstalled: exists }))
      })
      .then(({ installationDir, alreadyInstalled }) => {
        if (alreadyInstalled) {
          debug('Cypress already installed at', installationDir)
          if (options.force) {
            debug('...but installation was forced')
          } else {
            debug('Skipping installation')
            return installationDir
          }
        }

        debug('preparing to download and unzip version ', needVersion, 'to path', installationDir)

        const downloadDir = state.getDistDirectory()
        return downloadAndUnzip({ version: needVersion, installationDir, downloadDir })
        .thenReturn(installationDir)
      })
      .then((installationDir) => {
        return state.writeInstallDirectoryAsync(installationDir)
        .then(() => state.writeInstalledVersionAsync(needVersion))
        // wait 1 second for a good user experience
        .thenReturn(Promise.delay(1000))
      })
      .then(displayCompletionMsg)
    })
  })
}

module.exports = {
  start,
}
