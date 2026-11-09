# Cloudflare walkthrough

This is the long version of the steps on the **Domains** page. Example domain: `akulav.com`.

## 1. Domain on Cloudflare

- **Bought on Cloudflare Registrar:** nothing to do — the domain is already a Cloudflare zone.
- **Bought elsewhere:** Cloudflare dashboard → **Add a domain** → Free plan → copy the two nameservers → set them at your registrar → wait for the "active" email.

## 2. API token (lets AutoNode manage DNS and certificates)

1. <https://dash.cloudflare.com/profile/api-tokens> → **Create Token**.
2. **Edit zone DNS** → **Use template**.
3. Permissions → **+ Add more**:
   - Zone → **SSL and Certificates** → Edit (automatic Origin Certificates)
   - Zone → **Zone Settings** → Edit (one-click Full (strict))
   - Zone → **Zone** → Read
4. Zone Resources → Include → **All zones** (or a specific zone).
5. **Continue to summary** → **Create Token** → paste it into AutoNode.

With only the template permission (DNS edit), DNS works and you paste certificates by hand.

## 3. Reaching your computer

**Port forwarding (typical home setup)**

- Router admin page (usually `http://192.168.1.1` or `http://192.168.0.1`) → Port Forwarding / Virtual Server / NAT.
- TCP `80 → <server LAN IP>:80` and TCP `443 → <server LAN IP>:443`.
- Give the server a fixed address (**Network** page or a DHCP reservation in the router).
- AutoNode's dynamic DNS keeps the `A` records on your current public IP every 5 minutes.

**Cloudflare Tunnel (no port forwarding, works behind CGNAT)**

- <https://one.dash.cloudflare.com> → Networks → Tunnels → **Create a tunnel** → Cloudflared.
- Run the shown install command on the server.
- Add a **Public hostname** per domain: type `HTTP`, URL `localhost:80`.
- Turn off "Keep DNS updated automatically" in AutoNode (the tunnel owns those DNS records).

## 4. HTTPS certificate

**Automatic:** Domains page → *Create Automatically* next to your domain. AutoNode generates a key and CSR locally (`openssl`), asks Cloudflare's Origin CA for a 15-year certificate covering `akulav.com` and `*.akulav.com`, installs it and tries to set SSL to Full (strict).

**Manual:** Cloudflare → your domain → SSL/TLS → Origin Server → **Create Certificate** → RSA 2048, hostnames `*.akulav.com, akulav.com`, 15 years → paste *Origin Certificate* and *Private Key* into AutoNode (**Add Certificate**). The key is shown only once.

> Origin Certificates are trusted by Cloudflare only. Keep the orange cloud (Proxied) on for every record that uses one.

## 5. SSL mode

SSL/TLS → Overview → Configure → **Full (strict)**.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| *Too many redirects* | SSL mode is Flexible. Set it to **Full (strict)**. |
| Cloudflare error **521** | Cloudflare can't reach you: check port forwarding, and that HTTP/HTTPS show green on the Domains page. |
| Cloudflare error **526** | No valid certificate for that hostname on the server: add or create an Origin Certificate. |
| Cloudflare error **522** | Timed out: ISP may block 80/443 or use CGNAT — use a Cloudflare Tunnel. |
| AutoNode page "Nothing here yet" | The domain reaches AutoNode but isn't attached to a website. Add it under the website's **Domains** tab. |
| AutoNode page "Starting up…" (502) | The website isn't running or doesn't listen on `process.env.PORT`. Check its **Logs**. |
| DNS update error "already has a CNAME record" | Delete that record in Cloudflare, then **Update Now**. |
