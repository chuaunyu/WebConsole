var WebSocketServer = require('ws').Server;
var SSHConnection = require('ssh2');

var STATE_INIT = 0;
var STATE_INPUT_HOST_PORT = 1;
var STATE_INPUT_USER = 2;
var STATE_INPUT_PWD = 3;
var STATE_CONNECTING = 4;
var STATE_READY = 5;
var STATE_CLOSED = 6;

var CHAR_INPUT_ENTER_R = '\r';
var CHAR_INPUT_BACKSPACE = '\x7f';
var CHAR_INPUT_CTRL_C = '\x03';
var CHARS_OUTPUT_BACKSPACE = '\b\u001b[K';
var CHARS_OUTPUT_CLS = '\u001b[H\u001b[J';
var CHARS_OUTPUT_PRE = 'chuanyu@shell#';
var CHARS_OUTPUT_USAGE = 'Usage: ssh host [port]  \r\nfor example: ssh www.yourhost.com 8888, or ssh www.yourhost.com';
var CHARS_OUTPUT_CMD_NOT_FOUND = 'Command not found.';

var originIsAllowed = function(origin) {
	return true;
}

var SSHPty = function(ws){
	this.init(ws);
};
SSHPty.prototype = {
	ws : null,
	sshCon : null,
	sshStream : null,

	state : STATE_INIT,
	cmd : '',
	host : '',
	port : '',
	user : '',
	pwd : '',
	
	cols : 80,
	rows : 24,
	
	reset : function(){
		this.cmd = '';
		this.host = '';
		this.port = '';
		this.user = '';
		this.pwd = '';
		this.sendToConsole('\r\n'+CHARS_OUTPUT_PRE);
		this.state = STATE_INPUT_HOST_PORT;
	},
	
	init : function(ws){
		this.ws = ws;
		
		ws.on('message',function(thisRef){
			return function(){
				thisRef.onMessage.apply(thisRef, arguments);
			};
		}(this));
		
		ws.on('close', function(thisRef){
			return function(){
				thisRef.onWSEnd.apply(thisRef, arguments);
				thisRef.onSSHEnd.apply(thisRef, arguments);
			};
		}(this));
		
		ws.on('error', function(thisRef){
			return function(){
				thisRef.onSSHEnd.apply(thisRef, arguments);
			};
		}(this));
		
		this.sendToConsole(CHARS_OUTPUT_USAGE+'\r\n');
		this.sendToConsole(CHARS_OUTPUT_PRE);
	},
	
	// SSH step1 -> try to connect
	doSSH : function(){
		this.sshCon = new SSHConnection();
		
		this.sshCon.on('ready', function(thisRef){
			return function(){
				thisRef.onSSHReady.apply(thisRef, arguments);
			};
		}(this));
		
		this.sshCon.on('error', function(thisRef){
			return function(){
				thisRef.onSSHErr.apply(thisRef, arguments);
			};
		}(this));
		
		console.log('Try to connect to ' + this.user + '@' + this.host + ':' + this.port + ' pwd:' + this.pwd);
		this.sshCon.connect({
			host : this.host,
			port : this.port,
			username: this.user,
			password: this.pwd
		});
	},
	
	// SSH step2 -> connected
	onSSHReady : function(){
		console.log('SSH connectin is ready!');
		this.sshCon.shell({
			cols : this.cols,
			rows : this.rows
		}, function(thisRef) {
			return function(){
				thisRef.onSSHChannel.apply(thisRef, arguments);
			};
		}(this));
		
	},
	
	// SSH Step3 -> SSH Channel is ready
	onSSHChannel : function(err, stream){
		this.state = STATE_READY; 
		this.sshStream = stream;
		console.log('SSH channel is ready!');
		
		this.sshStream.on('data', function(thisRef){
			return function(){
				thisRef.onSSHData.apply(thisRef, arguments);
			};
		}(this));
		
		this.sshStream.on('end', function(thisRef){
			return function(){
				thisRef.onSSHEnd.apply(thisRef, arguments);
				console.log('SSH end');
			};
		}(this));
		
		this.sshStream.on('error', function(thisRef){
			return function(){
				thisRef.onSSHEnd.apply(thisRef, arguments);
				console.log('SSH error');
			};
		}(this));
		
		this.sshStream.on('close', function(thisRef){
			return function(){
				thisRef.onSSHEnd.apply(thisRef, arguments);
				console.log('SSH close');
			};
		}(this));
	},
	
	// SSH Step4 -> communicating
	onSSHData : function(data){
		if(this.state == STATE_READY){
			this.sendToConsole(data);
		}
	},
	
	sendData2SSH : function(data){
		if(this.sshStream){
			this.sshStream.write(data);
		}
	},
	
	// SSH Step5 -> end
	onSSHEnd : function(){
		this.state = STATE_CLOSED;
		if(this.sshCon){
			this.sshCon.end();
			this.sshCon = null;
			console.log("Close ssh connection.");
			this.reset();
		}
		this.state = STATE_INPUT_HOST_PORT;
	},
	
	onSSHErr : function(err){
		this.state = STATE_CLOSED;
		if(this.sshCon){
			this.sshCon.end();
			this.sshCon = null;
			this.sendToConsole('\r\nCatch SSH connection error.Err:' + err);
			console.log('Catch SSH connection error.Err:'+err);
			this.reset();
		}
		this.state = STATE_INPUT_HOST_PORT;
	},
	
	// WebSocket.send
	sendToConsole : function(data){
		if(this.ws){
			try{
				this.ws.send(data,{
					binary : false
				});
			}catch(e){
				console.log('Catch error, msg:'+e);
			}
			
		}
	},
	
	onWSEnd : function(){
		this.ws = null;
	},

	// WebSocket.onMessage
	onMessage : function(data){
		switch(this.state){
		case STATE_INIT:
			var headers = JSON.parse(data);
			this.cols = headers.cols || 80;
			this.rows = headers.rows || 24;
			this.state = STATE_INPUT_HOST_PORT;
			break;
		case STATE_INPUT_HOST_PORT:
			if(data == CHAR_INPUT_ENTER_R){
				var re=/^ssh\s+[\w\.]+(\s+[0-9]+)?$/g;
				this.cmd = this.cmd.trim();
				if(!this.cmd){
					this.reset();
					break;
				}
				
				if(!re.test(this.cmd)){
					this.sendToConsole('\r\n' + CHARS_OUTPUT_CMD_NOT_FOUND);
					this.sendToConsole('\r\n' + CHARS_OUTPUT_USAGE);
					this.reset();
					break;
				}
				
				var splits = this.cmd.split(' ');
				var count = 0;
				for(var i=0;i<splits.length;i++){
					var split = splits[i];
					if(!split){
						continue;
					}
					if(count == 1){
						this.host = split;
					}else if(count == 2){
						this.port = split;
					}
					count++;
				}
				
				if(!this.prot){
					this.port = '22';
				}
				
				this.sendToConsole('\r\nlogin as:');
				this.state = STATE_INPUT_USER;
			}else{
				if(data == CHAR_INPUT_BACKSPACE){
					if(this.cmd.length > 0){
						this.cmd = this.cmd.substring(0, this.cmd.length-1);
						this.sendToConsole(CHARS_OUTPUT_BACKSPACE);
					}
				}else if(data == CHAR_INPUT_CTRL_C){
					this.reset();
				}else if(data >= '\x20' && data <= '\x7e'){
					this.cmd += data;
					this.sendToConsole(data);
				}
			}
			break;
			
		case STATE_INPUT_USER:
			
			if(data == CHAR_INPUT_ENTER_R){
				this.sendToConsole('\r\n'+this.user+'@'+this.host+'\'s password:');	
				this.state = STATE_INPUT_PWD;
			}else{
				if(data == CHAR_INPUT_BACKSPACE){
					if(this.user.length > 0){
						this.user = this.user.substring(0, this.user.length-1);
						this.sendToConsole(CHARS_OUTPUT_BACKSPACE);
					}
				}else if(data == CHAR_INPUT_CTRL_C){
					this.reset();
				}else if(data >= '\x20' && data <= '\x7e'){
					this.user += data;
					this.sendToConsole(data);
				}
			}
			break;
		case STATE_INPUT_PWD:
			if(data == CHAR_INPUT_ENTER_R){
				this.sendToConsole('\r\nconnecting...');	
				this.state = STATE_CONNECTING;
				this.doSSH();
			}else{
				if(data == CHAR_INPUT_BACKSPACE){
					if(this.pwd.length > 0){
						this.pwd = this.pwd.substring(0, this.pwd.length-1);
					}
				}else if(data == CHAR_INPUT_CTRL_C){
					this.reset();
				}else if(data >= '\x20' && data <= '\x7e'){
					this.pwd += data;
				}
			}
			break;
		case STATE_READY:
			this.sendData2SSH(data);
			break;
		case STATE_CLOSED:
			if(data == CHAR_INPUT_CTRL_C){
				this.state = STATE_INPUT_HOST_PORT;
				this.user = '';
				this.pwd = '';
			}
			break;
		}
	}
};

var pipe = function(server, path, port) {
	var wss = new WebSocketServer({
		server: server,
		path : path,
		port : port
	}, function(){
		console.log("WebSocket Server已经启动.");
	});
	
	wss.on('connection', function(ws) {
		new SSHPty(ws);
	});
};

exports.pipe = pipe;