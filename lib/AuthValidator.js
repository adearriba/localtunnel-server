import http from 'http';

export class IAuthValidator {
    /**
     * Validates access given an implementation.
     * @param {http.IncomingMessage} req
     * @returns {Promise<boolean>}
     */
    async validateAccess(req) {
        throw new Error('validateClientCreation method not implemented');
    }
}

export class UnrestrictedAuthValidator extends IAuthValidator {
    constructor() {
        super();
    }

    async validateAccess(_req) {
        return true;
    }
}

export class SimpleAPIKeyAuthValidator extends IAuthValidator {
    /**
     * @param {string} apiKey
     */
    constructor(apiKey) {
        super();
        this.apiKey = apiKey;
    }

    async validateAccess(req) {
        return this.apiKey === this._getApiKeyFromRequest(req);
    }

    /**
     * Gets the api key from headers or query parameters.
     * @param {http.IncomingMessage} req
     * @returns {Promise<string | undefined>}
     */
    _getApiKeyFromRequest(req) {
        const url = new URL(req.url, 'http://localhost').searchParams;
        return req.headers['api-key'] || url.get('apikey') || undefined;
    }
}