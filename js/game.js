/*global console, document, window, navigator, XY */

"use strict";
var random = function (min, max) {
    if (max == null) {
        max = min;
        min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
};
Array.prototype.ranPick = function () {
    return this[random(this.length - 1)];
};

var Game = {
    POWERS_2: [2, 4, 8, 16,
                32, 64, 128, 256,
                512, 1024, 2048, 4096],
    
    INIT_INTERVAL: 1000,
    SPEED_UP: 100, // ms
    CELL: 50,
    PADDING: 5,
    ROW: 10,    // rows of grid
    COLUMN: 6   // columns of grid
};

Game.Grid = function (row, column) {
    this.row = row;
    this.column = column;
    this.node = null;
    this.build();
    this.initCells();
};
Game.Grid.prototype.build = function () {
    this.node = document.querySelector('.grid-container');
    var column, cell,
        i, j;
    for (i = 0; i < this.column; i++) {
        column = document.createElement('div');
        column.className = "grid-column";
        for (j = 0; j < this.row; j++) {
            cell = document.createElement('div');
            cell.className = "grid-cell";
            column.appendChild(cell);
        }
        this.node.appendChild(column);
    }
};
Game.Grid.prototype.initCells = function () {
    this.cells = [];
    for (var i = 0; i < this.column; i++) {
        this.cells.push([]);
    }
};

Game.Tile = function (power, xy) {
    this.value = power;
    this.node = null;
    if (xy !== undefined) {
        this.xy = xy;
    } else {
        this.xy = new XY(Math.floor(Game.COLUMN / 2), Game.ROW - 1);
    }
    this.build();
};
Game.Tile.prototype.build = function () {
    this.node = document.createElement("div");
    this.inner = document.createElement("div");
    var classes = ["tile", "tile-" + this.value];
    this.node.className = classes.join(" ");
    this.inner.className = "tile-inner";
    this.inner.textContent = this.value;
    this.node.appendChild(this.inner);
    this._position();
};
Game.Tile.prototype.fits = function (grid) {
    var xy = this.xy;
    if (xy.x < 0 || xy.x >= Game.COLUMN) return false;
    if (xy.y < 0) return false;
    if (grid.cells[xy.x][xy.y]) return false;
    return true;
};
Game.Tile.prototype._position = function () {
	this.node.style.left = (this.xy.x * (Game.CELL + Game.PADDING)) + "px";
	this.node.style.bottom = (this.xy.y * (Game.CELL + Game.PADDING)) + "px";
	return this;
};
Object.defineProperty(Game.Tile.prototype, "xy", {
	get: function () {
		return this._xy;
	},
	set: function (xy) {
		this._xy = xy;
		if (this.node) this._position();
	}
});

var gestures = new (function () {
    if (window.navigator.msPointerEnabled) {
        //Internet Explorer 10 style
        this.ms = true;
        this.touchstart = "MSPointerDown";
        this.touchmove  = "MSPointerMove";
        this.touchend   = "MSPointerUp";
    } else {
        this.ms = false;
        this.touchstart = "touchstart";
        this.touchmove  = "touchmove";
        this.touchend   = "touchend";
    }
    this.swpie = {
        threshold: 10 // threshold for swipe down
    };
    this.tap = {
        threshold: 2 // a minimal movement is ok
    };
})();

Game.Engine = function () {
    var _that = this;
    this.grid = new Game.Grid(Game.ROW, Game.COLUMN);
    
    this.gameContainer = document.querySelector('.game-container');
    this.tileContainer = document.querySelector('.tile-container');
    this.newGameContainer = document.querySelector('.game-new');
    this.pauseContainer = document.querySelector('.game-pause');
    this.nextTileElem = document.getElementById("next-tile");
    this.scoreContainer = document.querySelector('.score');
    
    // get the real cell width for different media screen
    Game.CELL = (this.tileContainer.offsetWidth + Game.PADDING) / Game.COLUMN - Game.PADDING;
    
    // mobile touch events: swipedown & tap
    var touchStart = [0, 0], touchEnd;
    this.tileContainer.addEventListener(gestures.touchstart, function (e) {
        if ((!gestures.ms && e.touches.length > 1) || e.targetTouches > 1) {
            return; // Ignore if touching with more than 1 finger
        }

        if (gestures.ms) {
            touchStart = [e.pageX, e.pageY];
        } else {
            touchStart = [e.touches[0].clientX, e.touches[0].clientY];
        }

        e.preventDefault();
    });
    this.tileContainer.addEventListener(gestures.touchmove, function (e) {
        e.preventDefault();
    });
    this.tileContainer.addEventListener(gestures.touchend, function (e) {
        if ((!gestures.ms && e.touches.length > 1) || e.targetTouches > 1) {
            return; // Ignore if touching with more than 1 finger
        }

        if (gestures.ms) {
            touchEnd = [e.pageX, e.pageY];
        } else {
            touchEnd = [e.changedTouches[0].clientX, e.changedTouches[0].clientY];
        }

        var dx = touchEnd[0] - touchStart[0], absDx = Math.abs(dx);
        var dy = touchEnd[1] - touchStart[1], absDy = Math.abs(dy);

        if (dy > gestures.swpie.threshold && absDx < absDy) { // swipe down
            _that.drop();
        } else if (absDx < gestures.tap.threshold && absDy < gestures.tap.threshold) { // tap
            _that.tap(touchEnd[0]);
        }
    });
    
    window.addEventListener("keydown", this);
    document.querySelector(".pause").addEventListener("click", function () {
        _that.pause();
    });
    document.getElementById("continue-game").addEventListener("click", function () {
        _that.pause();
    });
    document.getElementById("new-game").addEventListener("click", function () {
        _that.pauseContainer.style.display = "none";
        _that.newGameContainer.style.display = "block";
    });
    var i, modes = document.querySelectorAll(".mode");
    for (i = 0; i < modes.length; i++) {
        modes[i].addEventListener("click", function () {
            _that.newGameContainer.style.display = "none";
            _that.init(parseInt(this.dataset.mode, 10));
            _that.nextTile();
            _that.start();
        });
    }
};
Game.Engine.prototype.init = function (mode) {
    this.resetMessage(true);
    this.gameover = false;
    
    this.max = Game.POWERS_2[mode] * 2; // max merge value
    this.availablePowers = Game.POWERS_2.slice(0, mode + 1);
    
    this.level = 1;
    this.score = 0;
    
    // set grid cells and clear tile container
    this.grid.initCells();
    var last = this.tileContainer.lastChild;
    while (last && !last.id) {
        this.tileContainer.removeChild(last);
        last = this.tileContainer.lastChild;
    }
    
    this.interval = Game.INIT_INTERVAL;
    
    this.nextValue = null;
    this.tile = null;
};
Game.Engine.prototype.handleEvent = function (e) {
	switch (e.keyCode) {
        case 80: // P for pause
            e.preventDefault();
            this.pause();
            break;
		case 37: // left
			e.preventDefault();
			this.shift(-1);
            break;
		case 39: /* right */
			e.preventDefault();
			this.shift(+1);
            break;
		case 40: /* bottom */
			e.preventDefault();
			this.drop();
            break;
	}
};
Game.Engine.prototype.nextTile = function () {
    if (!this.nextValue) {
        this.nextValue = this.availablePowers.ranPick();
    }
    var value = this.nextValue;
    this.nextValue = this.availablePowers.ranPick();
    this.tile = new Game.Tile(value);
    this.tile.node.classList.add("tile-new");
    this.tileContainer.appendChild(this.tile.node);
    this.nextTileElem.className = "tile tile-" +  this.nextValue;
    this.nextTileElem.getElementsByTagName("div")[0].innerHTML = this.nextValue;
};
Game.Engine.prototype.levelUp = function () {
    this.level += 1;
    this.interval -= Game.SPEED_UP;
};
Game.Engine.prototype.drop = function () {
    if (this.gameover || !this.tile || this._processing) return;
    var gravity = new XY(0, -1);
    while (this.tile.fits(this.grid)) {
        this.tile.xy = this.tile.xy.plus(gravity);
    }
    this.tile.xy = this.tile.xy.minus(gravity);
    if (this.tile.xy.y >= Game.ROW - 1) {
        return this.gameOver();
    }
    this.grid.cells[this.tile.xy.x][this.tile.xy.y] = this.tile;
    
    this.stop();
    this._drop(this.tile.xy.x);
    return this;
};
Game.Engine.prototype.tap = function (x) {
    if (this.gameover || !this.tile || this._processing) { return; }
    var offsetX = this.gameContainer.offsetLeft,
        column = 0, offset = 0;
    column = Math.floor((x - offsetX) / (Game.CELL + Game.PADDING));
    if (column < 0 || column > Game.COLUMN - 1) { return; }
    this.highlightColumn(column);
    offset = column - this.tile.xy.x;
    if (offset === 0) { return; }
    this.shift(offset);
};
Game.Engine.prototype.shift = function (direction) {
	if (this.gameover || !this.tile || this._processing) { return; }
	var xy = new XY(direction, 0);
	this.tile.xy = this.tile.xy.plus(xy);
	if (!this.tile.fits(this.grid)) { this.tile.xy = this.tile.xy.minus(xy); }
	return this;
};
Game.Engine.prototype.merge = function (x) {
    var _that = this, interval = 200,
        cell_a, cell_b, cell_new, merged = false,
        i = this.grid.cells[x].length - 1, index;
    var gravity = new XY(0, -1);
    if (i <= 0) return merged;
    var _merge = function () {
        cell_a = _that.grid.cells[x][i];
        cell_b = _that.grid.cells[x][i-1];
        if (cell_a.value === cell_b.value && cell_a.value < _that.max) {
            merged = true;
            _that.tileContainer.removeChild(cell_b.node);
            cell_new = new Game.Tile(cell_a.value * 2, new XY(x, i-1));
            _that.grid.cells[x].splice(i-1, 2, cell_new); // remove old two & add new one
            _that.tileContainer.appendChild(cell_new.node);
            cell_new.node.classList.add('tile-merged');
            _that.tileContainer.removeChild(cell_a.node);
            _that.score += cell_a.value * 2;
            if (i < _that.grid.cells[x].length) {
                for (index = i; index < _that.grid.cells[x].length; index++) {
                    // shift cells down
                    _that.grid.cells[x][index].xy = 
                        _that.grid.cells[x][index].xy.plus(gravity);
                }
                // when merge from the bottom, reset i to top
                i = _that.grid.cells[x].length;
            }
        }
        if (--i) { // loop with delay
            if (!merged) {
                _merge();
            } else { // wait for animation
                setTimeout(function () {
                    _merge();
                }, interval);
            }
        } else { // done for the column
            if (merged) {
                setTimeout(function () {
                    _that.cleanUp();
                }, interval);
            }
        }
    };
    _merge();
    return merged;
};
Game.Engine.prototype.cleanUp = function () {
    var i, j, k, index,equal,
        cell_a, cell_b, cell,
        _that = this;
    var gravity = new XY(0, -1);
    for (i = 0; i < Game.ROW; i++) {
        equal = true;
        for (j = 0; j < Game.COLUMN - 1; j++) {
            // cell_a & cell_b are in the same row
            cell_a = this.grid.cells[j][i];
            cell_b = this.grid.cells[j+1][i];
            if (!cell_a || !cell_b || cell_a.value !== cell_b.value) {
                equal = false;
                continue;
            }
        }
        if (equal) {
            for (k = 0; k < Game.COLUMN; k++) {
                cell = this.grid.cells[k][i];
                (function _clean(cell, k){
                    cell.node.classList.remove('tile-merged');
                    cell.node.classList.add('tile-removed');
                    setTimeout(function () {
                        _that.tileContainer.removeChild(cell.node);
                        _that.grid.cells[k].splice(i, 1);
                        for (index = i; index < _that.grid.cells[k].length; index++) {
                            // shift cells down
                            _that.grid.cells[k][index].xy = 
                                _that.grid.cells[k][index].xy.plus(gravity);
                        }
                        setTimeout(function () {
                            _that.merge(k);
                        }, 200);
                    }, 200);
                })(cell, k);
            }
            _that.score += _that.grid.cells[0][i].value * Game.COLUMN;
            break; // only one row can be cleaned at one time
        }
    }
};
Game.Engine.prototype._drop = function (x) {
    this.stop();
    this._processing = true;
    if (!this.merge(x)) { // not merged, check whether there is row to clean up
        this.cleanUp();
    }
    this.nextTile();
    this.start();
    this._processing = false;
};
Game.Engine.prototype._tick = function () {
    //return;
	var gravity = new XY(0, -1);
	this.tile.xy = this.tile.xy.plus(gravity);
    if (!this.tile.fits(this.grid)) {
        this.tile.xy = this.tile.xy.minus(gravity);
        if (this.tile.xy.y >= Game.ROW - 1) {
            return this.gameOver();
        }
        this.grid.cells[this.tile.xy.x][this.tile.xy.y] = this.tile;
        this._drop(this.tile.xy.x);
    }
};
Game.Engine.prototype.pause = function () {
    if (this.gameover) return;
    if (this._interval) {
        clearInterval(this._interval);
        this._interval = null;
        this.pauseContainer.style.display = 'block';
    } else {
        this._interval = setInterval(this._tick.bind(this), this.interval);
        this.pauseContainer.style.display = 'none';
    }
};
Game.Engine.prototype.stop = function () {
    if (!this._interval) return;
    clearInterval(this._interval);
    this._interval = null;
};
Game.Engine.prototype.start = function () {
    if (this._interval) { return; }
	this._interval = setInterval(this._tick.bind(this), this.interval);
};
Game.Engine.prototype.gameOver = function () {
    this.gameover = true;
    this.stop();
    this.resetMessage();
    this.pauseContainer.style.display = "block";
    return false;
};
Game.Engine.prototype.highlightColumn = function (index) {
    var columns = document.querySelectorAll('.grid-column'), column = columns[index];
    if (column && !column.classList.contains('highlight')) {
        column.classList.add('highlight');
        setTimeout(function () {
            column.classList.remove('highlight');
        }, 75);
    }
};
Game.Engine.prototype.resetMessage = function (reset) {
    var msgContainer = this.pauseContainer.querySelector('.message');
    if (reset) { // reset to pause message
        msgContainer.textContent = "Pause";
        document.getElementById('continue-game').style.display = "block";
    } else { // game over message
        msgContainer.textContent = "Game Over";
        document.getElementById('continue-game').style.display = "none";
    }
};

Object.defineProperty(Game.Engine.prototype, "score", {
	get: function () {
		return this._score;
	},
	set: function (score) {
		this._score = score;
        this.scoreContainer.innerHTML = this._score + "";
        this.pauseContainer.querySelector('.score').innerHTML = "score: " + this._score;
	}
});

// main entry
Game.App = function () {
    this._engine = new Game.Engine();
};

new Game.App();