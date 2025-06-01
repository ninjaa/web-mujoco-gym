// Ultra-simple Claude proxy - no dependencies needed!
const http = require('http');
const https = require('https');

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    if (req.method === 'POST' && req.url === '/claude') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const options = {
                hostname: 'api.anthropic.com',
                path: '/v1/messages',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': req.headers['x-api-key'],
                    'anthropic-version': '2023-06-01'
                }
            };
            
            const apiReq = https.request(options, apiRes => {
                res.writeHead(apiRes.statusCode, apiRes.headers);
                apiRes.pipe(res);
            });
            
            apiReq.on('error', err => {
                res.writeHead(500);
                res.end(JSON.stringify({error: err.message}));
            });
            
            apiReq.write(body);
            apiReq.end();
        });
    }
});

server.listen(3001, () => {
    console.log('Claude proxy running on http://localhost:3001/claude');
});