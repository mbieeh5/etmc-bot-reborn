function sanitizePhoneNumber(rawPhone:string) {
    const cleaned = rawPhone.replace(/\D/g, '');
    if(cleaned.length < 8 || cleaned.length > 15) return null;
    
    return cleaned;
}

export { sanitizePhoneNumber };