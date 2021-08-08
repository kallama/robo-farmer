# Robo-Farmer 🤖

Enslave robots to manage your farms and harvest your crops.

### Features

- Farm one or multiple pools
- Multiple strategies available
  - Hold
    - Keep the farm tokens in your wallet
  - Sell
    - Swap the farm tokens rewards for `HODL_TOKEN_ADDRESS` defined in your .env file
  - Compound
    - Swap the farm tokens rewards for the pool tokens, use them to create more liqudity, add liquidity to pool
  - Hyper Compound (One of the pool tokens must be the farm token)
    - If one of the pool tokens is the farm token, when compounding, use other half from wallet
- Set how many minutes between harvests the robots are allowed to sleep
- Minimal risk of a robot uprising

### Requirements
- Node
- Yarn or NPM
- Optional: PM2

### Install
1. `yarn install`
2. Create a `.env` file and define your custom settings like `PRIVATE_KEY`

### Run
`yarn start`
#### Using PM2
1. `yarn build`
2. `pm2 start`

### Development

#### `npm run start:dev`

Starts the application in development using `nodemon` and `ts-node` to do hot reloading.

#### `npm run start`

Starts the app in production by first building the project with `npm run build`, and then executing the compiled JavaScript at `build/index.js`.

#### `npm run build`

Builds the app at `build`, cleaning the folder first.

#### `npm run test`

Runs the `jest` tests once.

#### `npm run test:dev`

Run the `jest` tests in watch mode, waiting for file changes.

#### `npm run prettier-format`

Format your code.

#### `npm run prettier-watch`

Format your code in watch mode, waiting for file changes.

