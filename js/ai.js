/**
 * Wrapper around the game grid
 * @param grid
 * @constructor
 */
var gridUtil = {
  countEmptyTiles: function(grid) {
    var emptyTiles = _.filter(this.readTileValues(grid), function(tile) {
      return tile === 0;
    });
    return emptyTiles.length;
  },
  readTileValues: function(grid) {
    // flatten the two dimensional grid into a single dimensional array
    // replace null values with a 0
    return _.map(_.flatten(grid.cells), function(tile) {
      return !!tile ? tile.value : 0
    });
  },
  largestTileValue: function(grid) {
    return _.max(this.readTileValues(grid));
  }
};


/**
 * Manage the AI stats panel.
 * @constructor
 */
function Stats() {
  this.actionEle = $('.ai-stats .action .data');
  this.lastMoveEle = $('.ai-stats .move .data');
  this.lastRewardEle = $('.ai-stats .reward .data');
  this.avgRewardEle = $('.ai-stats .avg-reward .data');

  this.gameMovesEle = $('.ai-stats .games .total-moves .data');
  this.gameLargestTileEle = $('.ai-stats .games .largest-tile .data');
  this.gameTileScoreEle = $('.ai-stats .games .total-tile-score .data');
  this.gameScoreEle = $('.ai-stats .games .final-score .data');

  this.init();
}
Stats.prototype.init = function() {
  this.action = '';
  this.avgReward = 0;
  this.lastReward = 0;
  this.totalMoves = 0;
  this.totalRewards = 0;
  this.lastGame = {};
};
Stats.prototype.recordAction = function(actionName, reward) {
  this.action = actionName;
  this.lastReward = reward;
  this.totalRewards += reward;
  this.totalMoves += 1;
  this.updateAverage();
  this.logAction();
};
Stats.prototype.recordGame = function(game) {
  console.log(game);
  
  this.lastGame = {
    totalMoves: this.totalMoves,
    largestTile: _.max(gridUtil.largestTileValue(game.grid)),
    tileScore: _.sum(gridUtil.readTileValues(game.grid)),
    score: game.score
  };
  this.logGame();
};
Stats.prototype.logGame = function() {
  this.gameMovesEle.prepend('<div>' + this.lastGame.totalMoves + '</div>');
  this.gameLargestTileEle.prepend('<div>' + this.lastGame.largestTile + '</div>');
  this.gameTileScoreEle.prepend('<div>' + this.lastGame.tileScore + '</div>');
  this.gameScoreEle.prepend('<div>' + this.lastGame.score + '</div>');
};
Stats.prototype.updateAverage = function() {
  this.avgReward = (this.totalRewards / this.totalMoves).toFixed(2);
};
Stats.prototype.logAction = function() {
  this.actionEle.prepend('<div>' + this.action + '</div>');
  this.lastMoveEle.prepend('<div>' + this.totalMoves + '</div>');
  this.lastRewardEle.prepend('<div>' + this.lastReward + '</div>');
  this.avgRewardEle.prepend('<div>' + this.avgReward + '</div>');
};
Stats.prototype.clearReadout = function() {
  this.actionEle.html('');
  this.lastMoveEle.html('');
  this.lastRewardEle.html('');
  this.avgRewardEle.html('');
};
Stats.prototype.reset = function() {
  this.init();
  this.clearReadout();
};

/**
 * The agent's brain
 * http://cs.stanford.edu/people/karpathy/convnetjs/demo/rldemo.html
 */
function createBrain(numInputs) {
  // 1 input for each tile, square board
  var num_inputs = numInputs;

  // 4 possibe directions agent can shift tiles
  var num_actions = 4;

  // amount of temporal memory. 0 = agent lives in-the-moment :)
  var temporal_window = 1;

  var network_size = num_inputs * temporal_window +
    num_actions * temporal_window + num_inputs;

  // the value function network computes a value of taking any of the possible actions
  // given an input state. Here we specify one explicitly the hard way
  // but user could also equivalently instead use opt.hidden_layer_sizes = [20,20]
  // to just insert simple relu hidden layers.
  var layer_defs = [];

  layer_defs.push({
    type: 'input',
    out_sx: 1,
    out_sy: 1,
    out_depth: network_size
  });
  layer_defs.push({type: 'fc', num_neurons: 50, activation: 'relu'});
  layer_defs.push({type: 'fc', num_neurons: 50, activation: 'relu'});
  layer_defs.push({type: 'regression', num_neurons: num_actions});

  // options for the Temporal Difference learner that trains the above net
  // by backprogagating the temporal difference learning rule.
  var tdtrainer_options = {
    learning_rate: 0.001,
    momentum: 0.0,
    batch_size: 64,
    l2_decay: 0.01
  };

  // agent parameter spec to play with
  var opt = {
    alpha: 0.01,                          // value function learning rate
    update: 'qlearn',                     // qlearn | sarsa
    epsilon: 0.2,                         // initial epsilon for epsilon-greedy policy, [0, 1)
    epsilon_min: 0.05,                    // probability for random actions
    epsilon_test_time: 0.05,              // don't make any random choices, ever
    experience_add_every: 5,              // number of time steps before we add another experience to replay memory
    experience_size: 10000,               // size of experience replay memory
    gamma: 0.9,                           // discount factor, [0, 1)
    layer_defs: layer_defs,
    learning_steps_per_iteration: 20,
    learning_steps_total: 200000,
    learning_steps_burnin: 3000,
    num_hidden_units: 10,                 // number of neurons in hidden layer
    start_learn_threshold: 1000,
    tderror_clamp: 1.0,                   // for robustness
    temporal_window: temporal_window,
    tdtrainer_options: tdtrainer_options
  };

  return new deepqlearn.Brain(num_inputs, num_actions, opt); // woohoo;
}

/**
 * The DQN agent has a brain plays a `game`.
 * @param {GameManager} game - An instance of GameManager for the 2048 game.
 * @constructor
 */
function Agent(game) {
  this.game = game;
  this.stats = new Stats();
  this.playSpeed = 200;
  this.actionMap = {
    0: 'up',
    1: 'right',
    2: 'down',
    3: 'left'
  };

  this.init()
}
Agent.prototype.init = function() {
  // one input for each tile
  var numBrainInputs = Math.pow(this.game.grid.size, 2);

  this.brain = createBrain(numBrainInputs);
  this.brainInterval = null;
};

Agent.prototype.start = function() {
  var self = this;

  // don't start another interval if we're already running
  if (!this.brainInterval) {
    this.brainInterval = setInterval(function() {
      self.takeAction();
    }, this.playSpeed);
  }
};

Agent.prototype.pause = function() {
  window.clearInterval(this.brainInterval);
  this.brainInterval = null;
};

Agent.prototype.reset = function() {
  window.clearInterval(this.brainInterval);
  this.stats.reset();
  this.game.restart();
  this.init();
};

Agent.prototype.setPlaySpeed = function(ms) {
  this.pause();
  this.playSpeed = ms;
  this.start();
};
Agent.prototype.takeAction = function() {
  var actionName;
  var action;
  var preAction = {
    score: this.game.score,
    tileValues: gridUtil.readTileValues(this.game.grid)
  };
  var reward;

  // if game is over, play again
  if (this.game.isGameTerminated()) {
    this.game.restart();
    this.stats.recordGame(this.game);
    this.stats.reset();
  }

  // MAKE DECISION
  // action is a number in [0, num_actions] indicating the index of the 
  //   action the agent chooses.
  // inputs to the brain are the tile values
  action = this.brain.forward(preAction.tileValues);

  // EXECUTE DECISION
  // apply the action on the environment and observe some reward.
  // see KeyboardInputManager keydown event listener
  // 0 up, 1 right, 2 down, 3 left
  this.game.inputManager.emit('move', action);
  var postAction = {
    score: this.game.score,
    tileValues: gridUtil.readTileValues(this.game.grid)
  };

  // LEARN FROM IT
  // observe effects and learn
  reward = this.calculateReward(preAction, postAction);
  this.brain.backward(reward);

  // update the stats
  actionName = this.actionMap[action];
  this.stats.recordAction(actionName, reward);
};
Agent.prototype.calculateReward = function(preAction, postAction) {
  var prevTileCount = _.compact(preAction.tileValues).length;
  var curTileCount = _.compact(postAction.tileValues).length;
  var didMergeTiles = curTileCount <= prevTileCount;
  var didMoveTiles = !_.isEqual(preAction.tileValues, postAction.tileValues);
  var reward;

  if (didMergeTiles) {
    reward = 1;
  } else {
    reward = -1;
  }

  if (!didMoveTiles) {
    reward = -5;
  }

  return reward;
};
