const http = require('http')
const port = 3030

const server = http.createServer(function(req, res){
	res.writeHead(200, {'Content-Type': 'text/json'})
	res.write('Hello Node')
	res.end()
})

server.listen(port, function(error) {
	if(error) {
		console.log('Error: ', error)
	} else {
		console.log('Listening on '+port)
	}
})