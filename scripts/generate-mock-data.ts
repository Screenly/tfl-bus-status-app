/**
 * Writes the `mock-data.yml` the dev server reads in place of a real player.
 *
 * The stop is the one the manifest ships with. The dev server talks to the real TfL API,
 * so put a key from https://api-portal.tfl.gov.uk/ in `tfl_api_token`, or
 * leave it empty to use TfL's anonymous, rate limited access.
 *
 * An existing file is left alone unless `--force` is passed.
 */

import fs from 'fs'
import path from 'path'

const MOCK_DATA_PATH = path.resolve(process.cwd(), 'mock-data.yml')

const MOCK_DATA = `---
metadata:
  coordinates:
    - '51.5080'
    - '-0.1281'
  location: London
  screen_name: Bus stop board
  hostname: dev-hostname
  screenly_version: development-server
  tags:
    - Development
settings:
  stop_id: 490005186S1
  tfl_api_token: ''
  theme: light
`

if (fs.existsSync(MOCK_DATA_PATH) && !process.argv.includes('--force')) {
  console.log(
    'mock-data.yml already exists, leaving it alone (--force to replace)',
  )
} else {
  fs.writeFileSync(MOCK_DATA_PATH, MOCK_DATA)
  console.log('Wrote mock-data.yml for the default stop')
}
