(function(global){
	var WebConsole = function(opts){
		this.init.call(this,opts);
	};
	
	WebConsole.prototype = {
		term : null,
		socket : null,
		url : null,
		
		cols : 80,
		rows : 24,
		
		socketOnMsg : function(message){
			this.term.write(message.data+'');
			$(document.body).focus();
		},
		
		socketEnd : function(){
			if(this.socket){
				this.term.write("Disconnected.\r\n");
				this.disConn();
			}
		},

		connect : function(){
			this.socket = new WebSocket(this.url);
			
			this.socket.onopen = function(thisRef){
				return function(){
					thisRef.termOnData.call(thisRef, '{"cols":'+thisRef.cols+',"rows":'+thisRef.rows+'}');
				};
		    }(this);
		    
			this.socket.onmessage = function(thisRef){
				return function(){
					thisRef.socketOnMsg.apply(thisRef, arguments);
				};
		    }(this);
		    
		    this.socket.onclose = function(thisRef){
				return function(){
					thisRef.socketEnd.apply(thisRef, arguments);
				};
		    }(this);
		    
		    this.socket.onerror = function(thisRef){
				return function(){
					thisRef.socketEnd.apply(thisRef, arguments);
				};
		    }(this);
		    
		    $(document.body).focus();
		},
		
		termOnData : function(data){
			if(this.socket){
				this.socket.send(data);
			}
		},
		
		init : function(opts){
			var thisRef = this;
			this.url = opts.url;
			this.cols = opts.cols || 80;
			this.rows = opts.rows || 24;
			
			this.term = new Terminal({
		        cols: this.cols,
		        rows: this.rows,
		        useStyle: true,
		        screenKeys: true
			});
			
			this.term.on('data', function(thisRef){
				return function(){
					thisRef.termOnData.apply(thisRef, arguments);
				};
			}(this));
			this.renderTo(opts.container);
			
			this.connect();
		},
		
		renderTo : function(container){
			this.term.open($(container)[0]);
			this.term.write('\x1b[31mWelcome to use Webconsole!\x1b[m\r\n');
			
			return this;
		}
	};
	
	global.WebConsole = WebConsole;
}(window));