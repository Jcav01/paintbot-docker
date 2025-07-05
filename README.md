# Paintbot GKE Deployment

This repository contains the Docker-based microservices architecture for Paintbot, with automated deployment to Google Kubernetes Engine (GKE) using GitHub Actions.

## Architecture

The application consists of the following services:
- **Database**: PostgreSQL database service
- **Discord**: Discord bot service
- **Twitch**: Twitch integration service
- **YouTube**: YouTube integration service (optional)

## Prerequisites

### Local Development
- Docker and Docker Compose
- Node.js 18+ 
- Google Cloud SDK (`gcloud`)
- `kubectl` CLI tool

### GKE Deployment
- Google Cloud Project with billing enabled
- GKE API enabled
- Container Registry API enabled
- A GKE cluster (or use the setup script to create one)

## Quick Start

### Local Development with Docker Compose

1. Clone the repository:
```bash
git clone <repository-url>
cd paintbot-docker
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Start the services:
```bash
docker-compose up -d
```

### GKE Deployment Setup

#### 1. Google Cloud Setup

Create a service account and download the key:

```bash
# Create service account
gcloud iam service-accounts create paintbot-deployer \
    --description="Service account for Paintbot GKE deployment" \
    --display-name="Paintbot Deployer"

# Grant necessary permissions
gcloud projects add-iam-policy-binding paintbot \
    --member="serviceAccount:paintbot-deployer@paintbot.iam.gserviceaccount.com" \
    --role="roles/container.developer"

gcloud projects add-iam-policy-binding paintbot \
    --member="serviceAccount:paintbot-deployer@paintbot.iam.gserviceaccount.com" \
    --role="roles/storage.admin"

gcloud projects add-iam-policy-binding paintbot \
    --member="serviceAccount:paintbot-deployer@paintbot.iam.gserviceaccount.com" \
    --role="roles/container.clusterAdmin"

# Create and download key
gcloud iam service-accounts keys create key.json \
    --iam-account=paintbot-deployer@paintbot.iam.gserviceaccount.com
```

#### 2. GitHub Secrets Setup

Add the following secrets to your GitHub repository:

- `GCP_SA_KEY`: Content of the service account key file (key.json)
- `GCP_SA_KEY_DEV`: Service account key for development environment (optional)

#### 3. Kubernetes Secrets

Create the necessary Kubernetes secrets using one of these methods:

**Option 1: Interactive Setup (Recommended)**
```powershell
.\deploy.ps1 create-secrets
```

**Option 2: Import from Existing JSON Files**
```powershell
.\deploy.ps1 import-secrets
```

**Option 3: Manual Creation**
```bash
# Twitch secrets
kubectl create secret generic twitch-secrets \
    --from-literal=client-id="your-twitch-client-id" \
    --from-literal=client-secret="your-twitch-client-secret" \
    --from-literal=eventsub-secret="your-eventsub-secret"

# Discord secrets
kubectl create secret generic discord-secrets \
    --from-literal=bot-token="your-discord-bot-token"

# Database secrets (including Cloud SQL connection)
kubectl create secret generic database-secrets \
    --from-literal=postgres-password="your-database-password" \
    --from-literal=postgres-user="paintbot" \
    --from-literal=postgres-db="paintbot" \
    --from-literal=instance-connection-name="you-cloud-sql-connection-name"

# Google Cloud service account key
kubectl create secret generic paintbot-service-account \
    --from-file=key.json=path/to/your/service-account-key.json
```

## Deployment Scripts

### Using PowerShell (Windows)

```powershell
# Setup GKE cluster (Autopilot)
.\deploy.ps1 setup

# Create secrets interactively
.\deploy.ps1 create-secrets

# Build Docker images
.\deploy.ps1 build

# Push images to registry
.\deploy.ps1 push

# Deploy to production
.\deploy.ps1 deploy

# Deploy to development
.\deploy.ps1 deploy-dev

# Check status
.\deploy.ps1 status

# View logs
.\deploy.ps1 logs database

# Debug issues
.\deploy.ps1 debug database
```

## GitHub Actions Workflows

**Important**: The GitHub Actions workflows need to be updated to work with the new Kubernetes secrets approach. Currently, they reference outdated secret management methods.

### Current Workflows (Need Updates)

### 1. CI Pipeline (`ci.yaml`) ✅ **Still Accurate**
- Runs on every push and pull request
- Tests all services with multiple Node.js versions
- Performs security scanning with Trivy
- Builds Docker images for testing

### 2. Production Deployment (`deploy-to-gke.yaml`) ⚠️ **Needs Updates**
- Triggers on pushes to `main` branch
- Builds and pushes Docker images
- **Issue**: Still tries to apply secret YAML files that no longer exist
- **Fix Needed**: Update to verify secrets exist instead of applying them

### 3. Development Deployment (`deploy-dev.yaml`) ⚠️ **Needs Updates** 
- Triggers on pushes to `develop` branch
- Deploys to development namespace
- **Issue**: References old secret file approach
- **Fix Needed**: Update secret handling for development namespace

### 4. Release Pipeline (`release.yaml`) ✅ **Still Accurate**
- Triggers on version tags (v*)
- Creates tagged Docker images
- Creates GitHub releases

### 5. Setup and Validation (`setup.yaml`) ⚠️ **Needs Updates**
- Manual workflow for initial setup
- **Issue**: May reference outdated secret validation
- **Fix Needed**: Update to work with kubectl-created secrets

### Required GitHub Actions Updates

The workflows need these changes to work with the new secrets approach:

1. **Remove secret YAML file applications**:
   ```yaml
   # Remove these lines from workflows:
   - kubectl apply -f k8s/database-secrets-secret.yaml
   - kubectl apply -f k8s/discord-secrets-secret.yaml
   - kubectl apply -f k8s/twitch-secrets-secret.yaml
   ```

2. **Add secret validation instead**:
   ```yaml
   # Add secret existence checks:
   - name: Verify secrets exist
     run: |
       kubectl get secret twitch-secrets
       kubectl get secret discord-secrets  
       kubectl get secret database-secrets
       kubectl get secret paintbot-service-account
   ```

3. **Update deployment commands**:
   ```yaml
   # Use combined deployment files:
   - kubectl apply -f k8s/database-deployment.yaml
   - kubectl apply -f k8s/discord-deployment.yaml
   - kubectl apply -f k8s/twitch-deployment.yaml
   ```

### Temporary Workaround

Until the workflows are updated, you should:

1. **Create secrets manually** before triggering GitHub Actions:
   ```powershell
   .\deploy.ps1 create-secrets
   ```

2. **Use local deployment** for now:
   ```powershell
   .\deploy.ps1 deploy
   ```

3. **Monitor GitHub Actions** and expect secret-related failures until updated

## Environment Configuration

### Production
- Namespace: `default`
- Cluster: `paintbot-cluster`
- Images tagged with `latest` and commit SHA

### Development  
- Namespace: `development`
- Cluster: `paintbot-dev-cluster` (or same cluster, different namespace)
- Images tagged with `dev-{SHA}`

## Monitoring and Troubleshooting

### Quick Debugging
```powershell
# Comprehensive debugging for a service
.\deploy.ps1 debug database
.\deploy.ps1 debug discord
.\deploy.ps1 debug twitch
```

### View Pod Status
```bash
kubectl get pods
kubectl describe pod <pod-name>
```

### View Logs
```bash
kubectl logs -f deployment/database
kubectl logs -f deployment/discord
kubectl logs -f deployment/twitch

# View previous crashed container logs
kubectl logs deployment/database --previous
```

### Check Secrets
```bash
# Verify secrets exist
kubectl get secrets

# Check secret contents (without revealing values)
kubectl describe secret database-secrets
kubectl describe secret discord-secrets
kubectl describe secret twitch-secrets
```

### Check Services
```bash
kubectl get services
kubectl get ingress
```

### Port Forwarding for Local Testing
```bash
# Database service
kubectl port-forward service/database 8002:8002

# Discord service  
kubectl port-forward service/discord 8001:8001

# Twitch service
kubectl port-forward service/twitch 8004:8004
```

### Common Issues

1. **Database connection errors**: Check if Cloud SQL instance is running and accessible
2. **Secret mounting issues**: Verify secrets exist and are properly named
3. **Image pull errors**: Ensure Docker registry authentication is working
4. **Pod crashes**: Use `.\deploy.ps1 debug <service>` for detailed troubleshooting

## Security Considerations

1. **Secrets Management**: All sensitive data is stored as individual Kubernetes secrets (not JSON files)
2. **No secrets in Git**: All secret values are created via kubectl and never committed to repository
3. **Image Security**: Trivy scanning is integrated into CI pipeline
4. **RBAC**: Use service accounts with minimal required permissions
5. **Secret file mounting**: Secrets are mounted as individual files for better security
6. **Network Policies**: Consider implementing network policies for production

### Secret Security Features
- **Individual secret files**: Each secret value is a separate mounted file
- **Read-only mounts**: All secrets are mounted read-only
- **No environment variable exposure**: Secrets not visible in `kubectl describe pod`
- **Automatic rotation support**: Secrets can be updated without image rebuilds

## Scaling

### Manual Scaling
```bash
kubectl scale deployment database --replicas=3
kubectl scale deployment discord --replicas=2
kubectl scale deployment twitch --replicas=2
```

### Horizontal Pod Autoscaler
```bash
kubectl autoscale deployment twitch --cpu-percent=50 --min=1 --max=10
```

## Backup and Recovery

### Database Backup
```bash
# Create backup job
kubectl create job --from=cronjob/database-backup database-backup-manual
```

### Configuration Backup
```bash
# Export all configurations
kubectl get all,secrets,configmaps -o yaml > backup.yaml
```

## Contributing

1. Create a feature branch from `develop`
2. Make your changes
3. Push to your branch - this will trigger development deployment
4. Create a pull request to `develop`
5. After review, merge to `develop`
6. For releases, create a pull request from `develop` to `main`

## Support

For issues and questions:

### Troubleshooting Steps
1. **Use the debug command**: `.\deploy.ps1 debug <service-name>`
2. **Check GitHub Actions logs** for deployment issues
3. **Review Kubernetes events**: `kubectl get events --sort-by=.metadata.creationTimestamp`
4. **Check pod logs**: `kubectl logs <pod-name>`
5. **Verify secrets**: `kubectl get secrets` and `kubectl describe secret <secret-name>`

### Common Issues and Solutions

**Database crashes (exit code 1)**:
```powershell
.\deploy.ps1 debug database
# Check if Cloud SQL instance exists and secrets are correct
```

**Secret not found errors**:
```powershell
# Recreate secrets
.\deploy.ps1 create-secrets
```

**Image pull errors**:
```powershell
# Re-authenticate with registry
gcloud auth configure-docker northamerica-northeast1-docker.pkg.dev
```

**Pod startup failures**:
```powershell
# Check pod events and logs
kubectl describe pod <pod-name>
kubectl logs <pod-name> --previous
```

### Getting Help
- Create an issue in this repository with debug output
- Include output from `.\deploy.ps1 debug <service>`
- Provide relevant pod logs and events


## First-Time Setup Guide

### 1. Prerequisites Check
```powershell
# Verify required tools are installed
gcloud --version
kubectl version --client
docker --version
```

### 2. Google Cloud Setup
```powershell
# Authenticate with Google Cloud
gcloud auth login

# Set your project
gcloud config set project paintbot

# Enable required APIs
gcloud services enable container.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

### 3. Complete Setup
```powershell
# Clone and navigate to repository
git clone <repository-url>
cd paintbot-docker

# Set up GKE cluster (Autopilot)
.\deploy.ps1 setup

# Create secrets (interactive)
.\deploy.ps1 create-secrets

# Build and deploy
.\deploy.ps1 build
.\deploy.ps1 push
.\deploy.ps1 deploy

# Verify deployment
.\deploy.ps1 status
```

### 4. Verify Everything Works
```powershell
# Check all pods are running
kubectl get pods

# Check services are accessible
kubectl get services

# Test connectivity
kubectl port-forward service/database 8002:8002
# Test: curl http://localhost:8002
```
