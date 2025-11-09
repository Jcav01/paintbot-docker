# Twitch EventSub Production Setup Guide for GKE

## Overview

This guide explains how to set up Twitch EventSub webhooks in production on Google Kubernetes Engine (GKE) with SSL termination.

> **Note:** The repo also ships a Cloudflare Tunnel deployment that replaces the Google HTTP(S) ingress for lower fixed cost. See [Cloudflare Tunnel Setup](#cloudflare-tunnel-setup).

## Architecture

- **External Traffic**: HTTPS (handled by GKE Ingress)
- **Internal Traffic**: HTTP (between Load Balancer and Pods)
- **SSL Termination**: At the GKE Ingress level
- **Webhook Path**: `/webhooks/twitch/*`

## Prerequisites

1. A domain name you control (e.g., `paintbot.yourdomain.com`)
2. GKE cluster running
3. `kubectl` configured for your cluster

## Setup Steps

### 1. Reserve a Static IP (Recommended)

```bash
# Reserve a global static IP
gcloud compute addresses create paintbot-ip --global

# Get the IP address
gcloud compute addresses describe paintbot-ip --global --format="get(address)"
```

### 2. Configure DNS

Point your domain to the static IP:

```
A record: paintbot.yourdomain.com -> YOUR_STATIC_IP
```

### 3. Deploy SSL Certificate and Ingress

Choose **ONE** of these approaches:

#### Option A: Google-Managed SSL (Recommended)

```bash
# Edit k8s/twitch-ingress.yaml and replace 'paintbot.net' with your domain
kubectl apply -f k8s/twitch-ingress.yaml

# Check certificate status (takes 5-15 minutes)
kubectl get managedcertificate twitch-ssl-cert -o yaml
```

#### Option B: Let's Encrypt

```bash
# First install cert-manager (if not already installed)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Edit k8s/twitch-ingress-letsencrypt.yaml and replace email/domain
kubectl apply -f k8s/twitch-ingress-letsencrypt.yaml
```

### 4. Update Deployment Configuration

```bash
kubectl apply -f k8s/twitch-deployment.yaml
```

### 5. Test the Setup

```bash
# Check ingress status
kubectl get ingress twitch-ingress

# Check certificate status
kubectl get managedcertificate

# Test webhook endpoint (should return 200)
curl -I https://paintbot.yourdomain.com/webhooks/twitch/
```

## How It Works

### SSL Termination Flow

1. **External Request**: `https://paintbot.yourdomain.com/webhooks/twitch/stream.online`
2. **GKE Ingress**: Terminates SSL, forwards HTTP to service
3. **Kubernetes Service**: Routes to Twitch pod on port 8004
4. **Express App**: Handles the webhook at `/webhooks/twitch/stream.online`

### EventSub Configuration

- Uses Express adapter with GKE ingress SSL termination
- **Webhook Base URL**: `https://your-domain.com/webhooks/twitch`

## Troubleshooting

### Certificate Issues

```bash
# Check certificate status
kubectl describe managedcertificate twitch-ssl-cert

# Check ingress events
kubectl describe ingress twitch-ingress

# View ingress controller logs
kubectl logs -n gke-system -l k8s-app=glbc
```

### Connectivity Issues

```bash
# Test internal service
kubectl port-forward service/twitch 8004:8004
curl http://localhost:8004/webhooks/twitch/

# Check pod logs
kubectl logs deployment/twitch -f
```

### Twitch EventSub Issues

```bash
# Check Twitch EventSub subscriptions
# Use Twitch CLI or API to verify webhook URL is reachable
```

## Security Notes

- SSL certificates are automatically renewed by Google Cloud
- All webhook traffic is encrypted in transit
- Internal pod communication uses HTTP (encrypted by service mesh if enabled)
- Webhook secret validation ensures authenticity

## Cloudflare Tunnel Setup

Use this option if you prefer Cloudflare to terminate HTTPS and tunnel traffic into the cluster, removing the need for Google Cloud HTTP(S) load balancers.

1. **Create the tunnel in Cloudflare**
   - Run `cloudflared tunnel login` once so `cert.pem` is created in `~/.cloudflared/`, then run `cloudflared tunnel create paintbot` on a workstation.
   - Download the generated `credentials.json` and note the tunnel UUID. In the Cloudflare dashboard, open your zone and add **proxied CNAME records** for every hostname you want to expose. For example, create DNS records:
     - `twitch.paintbot.net` → `UUID.cfargotunnel.com`
     - `youtube.paintbot.net` → `UUID.cfargotunnel.com`
       Ensure the orange cloud is enabled so Cloudflare terminates HTTPS. These records live in Cloudflare’s DNS UI (or via the API/`cloudflare` Terraform provider if you manage DNS as code). If you only expose Twitch, you can skip the additional hostnames.
2. **Populate Kubernetes secrets**
   - Copy `k8s/secrets/cloudflared-credentials-template.yaml`, fill it with the real credentials JSON (and optional tunnel token), then apply it to the target namespace.
3. **Patch the production overlay**
   - Update the `cloudflared-config` patch in `k8s/overlays/production/kustomization.yaml` with your tunnel UUID and hostnames.
4. **Deploy**
   - Apply the overlay: `kubectl apply -k k8s/overlays/production`.
5. **Verify**
   - Confirm the `cloudflared` pod is running and connected (Cloudflare dashboard should show the tunnel as healthy).
   - Hit your HTTPS endpoints to ensure traffic routes through Cloudflare into the cluster.

After this switch, ingress is handled by Cloudflare’s network, and TLS certificates are managed in the Cloudflare dashboard instead of Google Cloud.
