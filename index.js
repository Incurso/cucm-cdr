const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const { Pool } = require('pg')

// Load config file
let config = {}
try {
  config = yaml.safeLoad(fs.readFileSync('config.yaml', 'utf8'))
} catch (e) {
  // Print error message
  console.error(e.message)

  // TODO: alert error via email.

  // Exit
  process.exit(1)
}

// Create pool with connection parameters
const pool = new Pool(config.database)

async function parseData (data, filePath, tableName) {
  let lines = data.split('\n')
  let keys = lines[0].replace(/["]/g, '').split(',')

  // Change UNIQUEIDENTIFIER (MS SQL) to UUID (PostgreSQL)
  let types = lines[1]
    .replace('UNIQUEIDENTIFIER', 'UUID')  // Rename field to supported PostgreSQL data type
    .replace(/INTEGER/g, 'BIGINT')        // CMR is using larger numbers than integer (int4) provides
    .split(',')

  // Generate Create script
  let createTable = await generateCreateScript(keys, types, tableName)

  // Remove first two lines as we have already read them
  lines.splice(0, 2)

  // Remove last line if it is empty
  if (lines[lines.length - 1].length === 0) {
    lines.pop()
  }

  // Generate Insert script
  let insertInto = await generateInsertScript(keys, lines, filePath, tableName)

  return { create: createTable, insert: insertInto }
}

async function generateCreateScript (keys, types, tableName) {
  // Create table with each key in the CDR/CMR file as a value.
  let createTable = `CREATE TABLE IF NOT EXISTS ${tableName} (${keys.map((key, i) => { return `${key} ${types[i]}` })});`

  return createTable
}

async function generateInsertScript (keys, lines, filePath, tableName) {
  let file = path.basename(filePath)
  let values = []

  for (const line of lines) {
    // Replace " with ' and split on ,
    let tmpValues = line.replace(/["]/g, '\'').split(',').map(d => d ? d : 'null') // Set empty to null

    // If we have number of values equal to the number of keys push the value, else throw an error
    if (tmpValues.length === keys.length) {
      values.push(`(${tmpValues})`)
    } else {
      // Print error message
      console.error(`Timestamp: ${new Date()} File: ${file} Line: ${i + 3}`)

      // TODO: alert error via email.

      // Exit
      process.exit(1)
    }
  }

  // Generate insert into command.
  let insertInto = `INSERT INTO ${tableName} (${keys}) VALUES ${values};`

  return insertInto
}

async function archiveFile (data, filePath) {
  const date = new Date()
  const year = `${date.getFullYear()}`
  const month = (`0${date.getMonth() + 1}`).slice(-2)
  let file = path.basename(filePath)
  let archivePath = path.join(config.scanPath, 'archive', year, month)
  if (!fs.existsSync(archivePath)) {
    fs.mkdirSync(archivePath, { recursive: true })
  }

  fs.rename(filePath, path.join(archivePath, file), (err) => {
    if (err) throw err
  })
}

;(async () => {
  let totalEntries = 0
  let parsedFiles = 0
  let startTime = new Date()
  const client = await pool.connect()

  await fs.readdir(config.scanPath, async (err, files) => {
    if (err) throw err

    for (const file of files) {
      // Get full filePath
      let filePath = path.join(config.scanPath, file)

      // Ignore directories and files with extensions
      if (fs.lstatSync(filePath).isDirectory()) continue
      if (path.extname(file) !== '') continue
      if (!['cdr', 'cmr'].includes(file.slice(0, 3))) continue

      // Set tableType
      const tableName = file.slice(0, 3) === 'cdr' ? 'callDetailRecords' : 'callManagementRecords'

      // Read file
      let data = fs.readFileSync(filePath, 'utf8')
      // Generate SQL query
      let queryScripts = await parseData(data, filePath, tableName)

      try {
        await client.query('BEGIN')
        let resCreate = await client.query(queryScripts.create)
        let resInsert = await client.query(queryScripts.insert)
        await client.query('COMMIT')

        // If there is no rowCount a table was created
        if (resCreate.rowCount !== null) {
          console.log(`Created table ${tableName}`)
        }

        // Count rows inserted
        totalEntries += resInsert.rowCount
        // Count files proccessed
        parsedFiles++

        // Archive file
        archiveFile(data, filePath)

        console.log(`Inserted ${resInsert.rowCount} entries from ${file} Elapsed time: ${(new Date() - startTime) / 1000} seconds Total entries added: ${totalEntries}`)
      } catch (e) {
        console.error(`Unable to insert content from file: ${file}, Error: ${e.message}`)
        console.error(queryScripts)
        await client.query('ROLLBACK')

        // TODO: alert error via email.

        // Exit
        process.exit(1)
      }
    }

    // Close connection
    await client.end()

    console.log(`Inserted ${totalEntries} entries from ${parsedFiles} files in ${(new Date() - startTime) / 1000} seconds`)
    console.log('Done')
  })
})().catch(e => console.error(e.stack))
