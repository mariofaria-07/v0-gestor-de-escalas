const axios = require('axios');

async function testEndpoints() {
    const endpoints = [
        'https://adn.nfse.gov.br/v1/DFe/123',
        'https://adn.nfse.gov.br/contribuintes/v1/DFe/123',
        'https://adn.nfse.gov.br/api/v1/DFe/123',
        'https://sefaz.gov.br/v1/DFe/123'
    ];

    for (const url of endpoints) {
        console.log(`Testando: ${url}`);
        try {
            await axios.get(url, { timeout: 5000 });
            console.log(' - STATUS 200 OK');
        } catch (error) {
            if (error.response) {
                console.log(` - HTTP Error: ${error.response.status}`);
            } else if (error.code) {
                console.log(` - Node Error: ${error.code}`);
            } else {
                console.log(` - Error: ${error.message}`);
            }
        }
    }
}

testEndpoints();
