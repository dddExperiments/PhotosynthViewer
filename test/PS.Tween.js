var tween = PS.Tween.create({
	duration: 1000,
	start: 200,
	end: 400,
	onStart: function(p) {
		console.log("start -> " + p);
	},
	onUpdate: function(p) {
		console.log("update -> " + p);
	},
	onComplete: function(p) {
		console.log("end -> " + p);
	}
});			
setTimeout(function() {
	tween.start();
}, 2000);
setTimeout(function() {
	tween.stop();
}, 4000);	