"use strict";

/*
	The MIT License (MIT)

	Copyright (c) Microsoft Corporation

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in
	all copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	THE SOFTWARE.
*/

PS.Utils.Async.Queue = function(items, options) {
	var _options = {
		concurrency: 1,
		onProcess:  function() {},
		onComplete: function() {},
		onCancel:   function() {}
	};
	PS.extend(_options, options);
	_options.onCancel = PS.Utils.Async.fireOnce(_options.onCancel, _that, false);

	var _items      = items.slice(0);
	var _nbItems    = _items.length;
	var _processed  = 0;
	var _workerUsed = 0;

	var _that       = this;
	var _paused     = false;
	this.cancelled  = false;

	function next() {
		_processed++;
		_workerUsed--;

		if (_that.cancelled) {
			_options.onCancel.call(_that);
		}
		else if (_processed === _nbItems) {
			_options.onComplete.call(_that);
		}
		else if (!_paused) {
			update();
		}
	}

	function update() {
		//jshint loopfunc: true
		while (_workerUsed < _options.concurrency && _items.length > 0) {
			_workerUsed++;
			setTimeout((function() {
				var item = _items.shift();
				return function() {
					_options.onProcess.call(_that, item, PS.Utils.Async.fireOnce(next, _that, true));
				};
			})(), 0);
		}
		//jshint loopfunc: false
	}

	this.pause = function() {
		_paused = true;
	};

	this.resume = function() {
		_paused = false;

		if (_items.length === 0) {
			_options.onComplete.call(_that);
		}
		else {
			update();
		}
	};

	this.cancel = function() {
		this.cancelled = true;
	};

	_that.resume();
};
