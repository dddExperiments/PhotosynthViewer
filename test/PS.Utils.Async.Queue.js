var arr = PS.Utils.generateRangeArray(150);

var q = new PS.Utils.Async.Queue(arr, {
	concurrency: 2,
	onProcess: function(item, callback) {
		console.log("Processing: " + item);
		setTimeout(function() {			
			if (this.cancelled) {
				console.log("Aborted: " + item);
			}
			else {
				callback();
				if (Math.random() > 0.3)
					callback();
			}
		}, 100);
	},
	onComplete: function() {
		console.log("-> Complete");
	},
	onCancel: function(id) {
		console.log("Cancel: " + id);
	}
});

setTimeout(function() {
	console.log("Cancelling...");
	q.cancel();
}, 900);
