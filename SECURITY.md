# Security Policy

## API Key Security Best Practices

This extension requires a Fireworks AI API key to function. Protecting your API key is crucial to prevent unauthorized access and unexpected charges.

### Recommended: Auth File Storage

The most secure method is storing your API key in pi's auth file:

```bash
mkdir -p ~/.pi/agent
cat > ~/.pi/agent/auth.json << 'EOF'
{
  "fireworks": {
    "type": "api_key",
    "key": "fw-xxxxxxxxxxxxxxxx"
  }
}
EOF
chmod 600 ~/.pi/agent/auth.json
```

**Why this is secure:**

- File permissions restrict access to your user only
- Not exposed in shell history
- Not visible in process listings
- Persistent across sessions

### Alternative: .env File

For project-specific configuration:

```bash
echo "FIREWORKS_API_KEY=fw-xxxxxxxxxxxxxxxx" > .env
chmod 600 .env
node --env-file=.env $(which pi)
```

**Security considerations:**

- Add `.env` to `.gitignore` (already included in this repo)
- Set file permissions to 600 (owner read/write only)
- Never commit .env files to version control

### Less Secure: Environment Variables

Only use for temporary/one-time access:

```bash
export FIREWORKS_API_KEY=fw-xxxxxxxxxxxxxxxx
pi
```

**Security risks:**

- Key appears in shell history (~/.bash_history, ~/.zsh_history)
- Visible to other users via `ps aux` while pi runs
- Persists in environment for the entire session

**If you must use this method:**

```bash
# Clear from history immediately
history -c
# Or remove specific line
history -d <line-number>

# Clear from environment when done
unset FIREWORKS_API_KEY
```

## Key Management

### Rotating Your API Key

If you suspect your key has been compromised:

1. Generate a new key in [Fireworks AI Console](https://fireworks.ai/api-keys)
2. Update your auth.json or .env file immediately
3. Revoke the old key in the Fireworks console
4. Clear shell history if the old key was in an export command

### Checking for Key Exposure

Search your shell history for accidental exposure:

```bash
# bash/zsh
grep "FIREWORKS_API_KEY" ~/.bash_history ~/.zsh_history 2>/dev/null

# fish
grep "FIREWORKS_API_KEY" ~/.local/share/fish/fish_history 2>/dev/null

# Check environment
echo $FIREWORKS_API_KEY
```

If found, clear your history and rotate your key immediately.

## Reporting Security Issues

If you discover a security vulnerability in this extension:

1. **Do not** open a public issue
2. Email the maintainer directly with details
3. Allow reasonable time for a fix before public disclosure

## Security Checklist

Before using this extension, verify:

- [ ] API key is not in shell history
- [ ] `.env` file is in `.gitignore`
- [ ] `.env` and `auth.json` have 600 permissions
- [ ] API key is not hardcoded in any source files
- [ ] Using auth.json or .env method (not export)
- [ ] Old/compromised keys have been revoked

## Resources

- [Fireworks AI API Keys](https://fireworks.ai/api-keys)
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_CheatSheet.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
