const _ = require('lodash')
const os = require('os')
const path = require('path')
const progress = require('request-progress')
const Promise = require('bluebird')
const request = require('request')
const url = require('url')
const debug = require('debug')('cypress:cli')
const { stripIndent } = require('common-tags')
const is = require('check-more-types')

const { throwFormErrorText, errors } = require('../errors')
const fs = require('../fs')
const util = require('../util')

const baseUrl = 'https://download.cypress.io/'

const prepend = (urlPath) => {
  const endpoint = url.resolve(baseUrl, urlPath)
  const platform = os.platform()
  const arch = os.arch()
  return `${endpoint}?platform=${platform}&arch=${arch}`
}

const getUrl = (version) => {
  if (is.url(version)) {
    debug('version is already an url', version)
    return version
  }
  return version ? prepend(`desktop/${version}`) : prepend('desktop')
}

const statusMessage = (err) =>
  (err.statusCode
    ? [err.statusCode, err.statusMessage].join(' - ')
    : err.toString())

const prettyDownloadErr = (err, version) => {
  const msg = stripIndent`
    URL: ${getUrl(version)}
    ${statusMessage(err)}
  `
  debug(msg)

  return throwFormErrorText(errors.failedDownload)(msg)
}

// downloads from given url
// return an object with
// {filename: ..., downloaded: true}
const downloadFromUrl = (options) => {
  return new Promise((resolve, reject) => {
    const url = getUrl(options.version)

    debug('Downloading from', url)
    debug('Saving file to', options.downloadDestination)

    const req = request({
      url,
      followRedirect (response) {
        const version = response.headers['x-version']
        if (version) {
          // set the version in options if we have one.
          // this insulates us from potential redirect
          // problems where version would be set to undefined.
          options.version = version
        }

        // yes redirect
        return true
      },
    })

    // closure
    let started = null

    progress(req, {
      throttle: options.throttle,
    })
    .on('response', (response) => {
      // start counting now once we've gotten
      // response headers
      started = new Date()

      // if our status code does not start with 200
      if (!/^2/.test(response.statusCode)) {
        debug('response code %d', response.statusCode)

        const err = new Error(
          stripIndent`
          Failed downloading the Cypress binary.
          Response code: ${response.statusCode}
          Response message: ${response.statusMessage}
        `
        )

        reject(err)
      }
    })
    .on('error', reject)
    .on('progress', (state) => {
      // total time we've elapsed
      // starting on our first progress notification
      const elapsed = new Date() - started

      const eta = util.calculateEta(state.percent, elapsed)

      // send up our percent and seconds remaining
      options.onProgress(state.percent, util.secsRemaining(eta))
    })
    // save this download here
    .pipe(fs.createWriteStream(options.downloadDestination))
    .on('finish', () => {
      debug('downloading finished')

      resolve({
        downloadDestination: options.downloadDestination,
        downloaded: true,
      })
    })
  })
}

// returns an object with zip filename
// and a flag if the file was really downloaded
// or not. Maybe it was already there!
// {filename: ..., downloaded: true|false}
const download = (options) => {

  debug('needed Cypress version: %s', options.version)
  return downloadFromUrl(options)
}

const start = (options) => {
  _.defaults(options, {
    version: null,
    throttle: 100,
    onProgress: () => {},
    downloadDestination: path.join(options.downloadDir, 'cypress.zip'),
  })
  debug(`downloading cypress.zip to "${options.downloadDestination}"`)

  // ensure download dir exists
  return fs.ensureDirAsync(options.downloadDir)
  .then(() => {
    return download(options)
  })
  .catch((err) => {
    return prettyDownloadErr(err, options.version)
  })
}

module.exports = {
  start,
  getUrl,
}
