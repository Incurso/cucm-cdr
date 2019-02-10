# cucm-cdr

cucm-cdr is a NodeJS library for parsing CDR files from Cisco Unified CallManager.

## Installation

```bash
git clone git@github.com:Incurso/cucm-cdr.git
cd cucm-cdr
npm install
```

## Prerequisites

PostgreSQL database and a user with enough permissions to create tables.

## Configure

Configure the ```config.yaml```
```
# Path to scan for CDR files
scanPath: <path where cdr files are located>

# Name of the CDR insert table
tableName: <table name>

# Database information
database:
  host: <hostname or ip address>
  port: <5432 or prot number>
  database: <database name>
  user: <username>
  password: <password>
```
## Usage

```
npm start
```

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License
[MIT](https://choosealicense.com/licenses/mit/)
