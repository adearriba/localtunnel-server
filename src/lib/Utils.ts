export interface Result {
    success: boolean
    message?: string
}

export function validateSubdmain(subdomain: string): Result {
    if (!/^(?:[a-z0-9][a-z0-9\-]{4,63}[a-z0-9]|[a-z0-9]{4,63})$/.test(subdomain)) {
        return {
            message: 'Invalid subdomain. Subdomains must be lowercase and between 4 and 63 alphanumeric characters.',
            success: false,
        }
    }

    return { success: true }
}