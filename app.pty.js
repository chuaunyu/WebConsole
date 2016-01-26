var express = require('express');
var SSHPty = require('./modules/SSHPty');

var app = null,
    server = null;

app = express();
app.use(express.static('public'));

server = app.listen(8801, function() {
    var host = server.address().address;
    var port = server.address().port;

    console.log('App listening at http://%s:%s', host, port);
});
SSHPty.pipe(server, '/WebConsole', 8901);