import request from 'supertest';
import assert from 'assert';
import createServer from '../server';
import { SimpleAPIKeyAuthValidator, UnrestrictedAuthValidator } from './AuthValidator';

describe('Server Auth Tests', () => {
    let server;
    let serverPort = 9000;

    beforeEach(async () => {
        const options = {
            api_auth_strategy: new SimpleAPIKeyAuthValidator('correct-api-key'),
            tunnel_auth_strategy: new SimpleAPIKeyAuthValidator('correct-api-key'),
            subdomain_auth_strategy: new UnrestrictedAuthValidator(),
            domain: 'localhost'
        };
        server = createServer(options).listen(serverPort);
        await new Promise(resolve => server.once('listening', resolve)); // Ensure server is listening before continuing
    });

    afterEach(async () => {
        await new Promise(resolve => server.close(resolve)); // Properly close the server using Promises
    });

    it('should allow unrestricted access to subdomain requests', async () => {
        await request(`http://localhost:${serverPort}`)
            .get('/')
            .set('Host', `http://example-subdomain.localhost:${serverPort}`)
            .expect(404, '404');
    });

    it('should deny access to API status without correct API key', async () => {
        await request(`http://localhost:${serverPort}`)
            .get('/api/status')
            .expect(401, 'Unauthorized');
    });

    it('should allow access to API status with correct API key', async () => {
        await request(`http://localhost:${serverPort}`)
            .get('/api/status')
            .set('api-key', 'correct-api-key')
            .expect(200);
    });

    it('should deny access to tunnel status without correct API key', async () => {
        await request(`http://localhost:${serverPort}`)
            .get('/api/tunnels/some-tunnel-id/status')
            .expect(401, 'Unauthorized');
    });

    it('should allow access to tunnel status with correct API key', async () => {
        await request(`http://localhost:${serverPort}`)
            .get('/api/tunnels/some-tunnel-id/status')
            .set('api-key', 'correct-api-key')
            .expect(404);  // Assumes no such client, but authenticated
    });

    it('should deny client creation without correct API key', async () => {
        await request(`http://localhost:${serverPort}`)
            .get('/')
            .query({ new: true })
            .expect(401, 'Unauthorized');
    });

    it('should allow client creation with correct API key', async () => {
        const response = await request(`http://localhost:${serverPort}`)
            .get('/test-client')
            .query({ new: true })
            .set('api-key', 'correct-api-key')
            .expect(200);

        assert.ok(response.body.url.includes('test-client'));
    });

    it('should redirect to landing page for root path without new client query', async () => {
        const response = await request(`http://localhost:${serverPort}`)
            .get('/')
            .expect(302);

        assert.equal(response.headers.location, 'https://localtunnel.github.io/www/');
    });
});
