[Description]
This is a very crude implementation of persistent storage for annotations using node.js/mongodb.
Concurrent calls to the same synth GUID may provoke undefined result + no security concern was taken for this quick hack.

[Installation]
You need to install node.js and mongodb.
Then you need to run 'npm install' in this folder

[Usage]
You need to double-click on launch.bat
And then you can go to http://localhost:3000/synths to see the list of synths with annotations
The annotation editor in Annotations_2D is using this service to store annotations.
