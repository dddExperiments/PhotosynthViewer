var a = {
	id: 41,
	viewer: {
		w: 1280,
		h: 720,
		hello: function() {},
		hello1: function() { return "0"; },
	},
	data: {
		id: 42
	}
};

var b = {
	id: 42,
	viewer: {
		w: 800,
		depth: 42,
		hello1: function() { return "1"; },
		hello2: function() {},
	},
	options: {
		counter: 1,
		other: {
			index: 1,
		}
	},
	arr: [10, {test: 24}, 5]
};

var c = PS.extend({}, b);
PS.extend(a, b);
b.arr[0] = 42;
b.arr[1].test = 424;
b.options.counter++;

console.log(a);
console.log(a.viewer.hello1());
