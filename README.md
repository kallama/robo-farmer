# Robo-Farmer 🤖🌾

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
- Polygonscan API Key ([https://polygonscan.com/apis](https://polygonscan.com/apis))
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

#### `yarn start:dev`

Starts the application in development using `nodemon` and `ts-node` to do hot reloading.

#### `yarn start`

Starts the app in production by first building the project with `yarn build`, and then executing the compiled JavaScript at `build/index.js`.

#### `yarn build`

Builds the app at `build`, cleaning the folder first.

#### `yarn test`

Runs the `jest` tests once.

#### `yarn test:dev`

Run the `jest` tests in watch mode, waiting for file changes.

#### `yarn prettier-format`

Format your code.

#### `yarn prettier-watch`

Format your code in watch mode, waiting for file changes.

