# Paintbot GKE Deployment Helper Script (PowerShell)

param(
    [Parameter(Position=0)]
    [string]$Command = "help",
    [Parameter(Position=1)]
    [string]$Service = ""
)

# Configuration
$ProjectId = "paintbot"
$ClusterName = "paintbot-cluster"
$Zone = "northamerica-northeast1"
$Registry = "northamerica-northeast1-docker.pkg.dev"

function Print-Usage {
    Write-Host "Usage: .\deploy.ps1 [COMMAND] [OPTIONS]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor Cyan
    Write-Host "  setup           Setup GKE cluster and required resources"
    Write-Host "  create-secrets  Interactive secret creation helper" 
    Write-Host "                 (use: .\\deploy.ps1 create-secrets [namespace], e.g. 'development')" -ForegroundColor DarkGray
    Write-Host "  build           Build all Docker images"
    Write-Host "  push            Push all Docker images to registry"
    Write-Host "  deploy          Deploy to GKE cluster"
    Write-Host "  deploy-dev      Deploy to development namespace"
    Write-Host "  status          Check deployment status"
    Write-Host "  logs SERVICE    Show logs for a service"
    Write-Host "  cleanup         Delete all resources"
    Write-Host "  help            Show this help message"
    Write-Host ""
    Write-Host "Services: database, discord, twitch, youtube" -ForegroundColor Green
}

function Setup-GKE {
    Write-Host "Setting up GKE cluster..." -ForegroundColor Yellow
    
    # Check if cluster exists
    $clusterExists = $false
    try {
        $result = gcloud container clusters describe $ClusterName --zone=$Zone --project=$ProjectId 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Found existing cluster: $ClusterName" -ForegroundColor Green
            $clusterExists = $true
        }
    } catch {
        Write-Host "Cluster not found or error occurred: $_" -ForegroundColor Yellow
        $clusterExists = $false
    }
    
    if (-not $clusterExists) {
        Write-Host "Creating GKE cluster..." -ForegroundColor Green
        gcloud container clusters create-auto $ClusterName `
            --zone=$Zone `
            --project=$ProjectId
    } else {
        Write-Host "Cluster already exists, getting credentials..." -ForegroundColor Green
    }
    
    # Get credentials
    gcloud container clusters get-credentials $ClusterName --zone=$Zone
    
    # Create namespaces
    kubectl create namespace development --dry-run=client -o yaml | kubectl apply -f -
    kubectl create namespace staging --dry-run=client -o yaml | kubectl apply -f -
    
    Write-Host "GKE setup complete!" -ForegroundColor Green
}

function Build-Images {
    Write-Host "Building Docker images..." -ForegroundColor Yellow
    
    $services = @("database", "discord", "twitch", "youtube")
    
    foreach ($service in $services) {
        if ((Test-Path $service) -and (Test-Path "$service\Dockerfile")) {
            Write-Host "Building $service..." -ForegroundColor Cyan
            Set-Location $service
            docker build -t "$Registry/$ProjectId/paintbot/$service`:latest" .
            Set-Location ..
        } else {
            Write-Host "Skipping $service (no Dockerfile found)" -ForegroundColor Yellow
        }
    }
    
    Write-Host "Build complete!" -ForegroundColor Green
}

function Push-Images {
    Write-Host "Pushing Docker images to registry..." -ForegroundColor Yellow
    
    # Configure Docker auth
    gcloud auth configure-docker $Registry --quiet
    
    $services = @("database", "discord", "twitch", "youtube")
    
    foreach ($service in $services) {
        $imageName = "$Registry/$ProjectId/paintbot/$service"
        $imageExists = docker images --format "{{.Repository}}:{{.Tag}}" | Select-String "$imageName`:latest"
        
        if ($imageExists) {
            Write-Host "Pushing $service..." -ForegroundColor Cyan
            docker push "$imageName`:latest"
        }
    }
    
    Write-Host "Push complete!" -ForegroundColor Green
}

function Deploy-ToGKE {
    Write-Host "Deploying to GKE..." -ForegroundColor Yellow
    
    # Check secrets first
    if (-not (Setup-And-Create-Secrets)) {
        Write-Host "Deployment aborted - secrets not configured" -ForegroundColor Red
        return
    }
    
    # Apply combined deployment and service files
    Write-Host "Applying deployments and services..." -ForegroundColor Cyan
    
    if (Test-Path "k8s/database-deployment.yaml") {
        Write-Host "Deploying database..." -ForegroundColor Cyan
        kubectl apply -f k8s/database-deployment.yaml
    }
    
    if (Test-Path "k8s/discord-deployment.yaml") {
        Write-Host "Deploying discord..." -ForegroundColor Cyan
        kubectl apply -f k8s/discord-deployment.yaml
    }
    
    if (Test-Path "k8s/twitch-deployment.yaml") {
        Write-Host "Deploying twitch..." -ForegroundColor Cyan
        kubectl apply -f k8s/twitch-deployment.yaml
    }
    
    # Apply YouTube if exists
    if (Test-Path "k8s/youtube-deployment.yaml") {
        Write-Host "Deploying youtube..." -ForegroundColor Cyan
        kubectl apply -f k8s/youtube-deployment.yaml
    }
    
    # Wait for deployments to be ready
    Write-Host "Waiting for deployments to be ready..." -ForegroundColor Yellow
    kubectl wait --for=condition=available --timeout=300s deployment/database
    kubectl wait --for=condition=available --timeout=300s deployment/discord
    kubectl wait --for=condition=available --timeout=300s deployment/twitch
    kubectl wait --for=condition=available --timeout=300s deployment/youtube
    
    Write-Host "Deployment complete!" -ForegroundColor Green
    Write-Host "Run '.\deploy.ps1 status' to check the deployment status" -ForegroundColor Cyan
}

function Deploy-Dev {
    Write-Host "Deploying to development namespace..." -ForegroundColor Yellow
    
    # Check if secrets exist in development namespace
    $devSecretsExist = $true
    
    $services = @("twitch-secrets", "discord-secrets", "database-secrets", "youtube-secrets", "paintbot-service-account")
    foreach ($service in $services) {
        $secretExists = kubectl get secret $service -n development 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Secret $service not found in development namespace" -ForegroundColor Yellow
            $devSecretsExist = $false
        }
    }
    
    if (-not $devSecretsExist) {
        Write-Host "Creating secrets in development namespace..." -ForegroundColor Yellow
        Write-Host "You may need to manually copy secrets to the development namespace:" -ForegroundColor Cyan
        Write-Host "kubectl get secret twitch-secrets -o yaml | ForEach-Object { $_ -replace 'namespace: .*', 'namespace: development' } | kubectl apply -f -" -ForegroundColor Cyan
        Write-Host "kubectl get secret discord-secrets -o yaml | ForEach-Object { $_ -replace 'namespace: .*', 'namespace: development' } | kubectl apply -f -" -ForegroundColor Cyan
        Write-Host "kubectl get secret database-secrets -o yaml | ForEach-Object { $_ -replace 'namespace: .*', 'namespace: development' } | kubectl apply -f -" -ForegroundColor Cyan
        Write-Host "kubectl get secret paintbot-service-account -o yaml | ForEach-Object { $_ -replace 'namespace: .*', 'namespace: development' } | kubectl apply -f -" -ForegroundColor Cyan
        Write-Host "kubectl get secret youtube-secrets -o yaml | ForEach-Object { $_ -replace 'namespace: .*', 'namespace: development' } | kubectl apply -f -" -ForegroundColor Cyan
    }
    
    # Apply ConfigMaps to development namespace
    if (Test-Path "k8s/twitch-env-configmap.yaml") {
        kubectl apply -f k8s/twitch-env-configmap.yaml -n development
    }
    
    
    # Apply combined deployment and service files
    Write-Host "Applying deployments and services..." -ForegroundColor Cyan
    
    if (Test-Path "k8s/database-deployment.yaml") {
        Write-Host "Deploying database..." -ForegroundColor Cyan
        kubectl apply -f k8s/database-deployment.yaml -n development
    }
    
    if (Test-Path "k8s/discord-deployment.yaml") {
        Write-Host "Deploying discord..." -ForegroundColor Cyan
        kubectl apply -f k8s/discord-deployment.yaml -n development
    }
    
    if (Test-Path "k8s/twitch-deployment.yaml") {
        Write-Host "Deploying twitch..." -ForegroundColor Cyan
        kubectl apply -f k8s/twitch-deployment.yaml -n development
    }
    
    # Apply YouTube if exists
    if (Test-Path "k8s/youtube-deployment.yaml") {
        Write-Host "Deploying youtube..." -ForegroundColor Cyan
        kubectl apply -f k8s/youtube-deployment.yaml -n development
    }
    
    # Wait for deployments to be ready in development namespace
    Write-Host "Waiting for deployments to be ready in development namespace..." -ForegroundColor Yellow
    kubectl wait --for=condition=available --timeout=300s deployment/database -n development
    kubectl wait --for=condition=available --timeout=300s deployment/discord -n development
    kubectl wait --for=condition=available --timeout=300s deployment/twitch -n development
    kubectl wait --for=condition=available --timeout=300s deployment/youtube -n development

    Write-Host "Development deployment complete!" -ForegroundColor Green
}

function Check-Status {
    Write-Host "Checking deployment status..." -ForegroundColor Yellow
    
    Write-Host "`nDeployments:" -ForegroundColor Cyan
    kubectl get deployments
    
    Write-Host "`nPods:" -ForegroundColor Cyan
    kubectl get pods
    
    Write-Host "`nServices:" -ForegroundColor Cyan
    kubectl get services
    
    Write-Host "`nNodes:" -ForegroundColor Cyan
    kubectl get nodes
}

function Show-Logs {
    param([string]$ServiceName)
    
    if ([string]::IsNullOrEmpty($ServiceName)) {
        Write-Host "Please specify a service name" -ForegroundColor Red
        return
    }
    
    Write-Host "Showing logs for $ServiceName..." -ForegroundColor Yellow
    kubectl logs -f deployment/$ServiceName
}

function Cleanup {
    Write-Host "Cleaning up resources..." -ForegroundColor Yellow
    
    $confirmation = Read-Host "Are you sure you want to delete all resources? (y/N)"
    if ($confirmation -eq "y" -or $confirmation -eq "Y") {
        kubectl delete -f k8s/ --ignore-not-found=true
        kubectl delete namespace development --ignore-not-found=true
        kubectl delete namespace staging --ignore-not-found=true
        Write-Host "Cleanup complete!" -ForegroundColor Green
    } else {
        Write-Host "Cleanup cancelled." -ForegroundColor Yellow
    }
}

function Setup-And-Create-Secrets {
    param([string]$Namespace = "")
    Write-Host "Secret Setup & Creation Helper" -ForegroundColor Yellow
    Write-Host "This will check for and create all required secrets interactively if missing." -ForegroundColor Cyan
    Write-Host "" 

    $nsArgs = @()
    if ($Namespace -and $Namespace.Trim() -ne "") {
        $nsArgs = @("--namespace", $Namespace.Trim())
    }

    # Twitch secrets
    $twitchSecretExists = kubectl get secret twitch-secrets @nsArgs 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Twitch secrets not found. Creating..." -ForegroundColor Cyan
        $twitchClientId = Read-Host "Enter your Twitch Client ID"
        $twitchClientSecret = Read-Host "Enter your Twitch Client Secret" -AsSecureString
        $twitchEventSubSecret = Read-Host "Enter your Twitch EventSub Secret" -AsSecureString
        $twitchClientSecretPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($twitchClientSecret))
        $twitchEventSubSecretPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($twitchEventSubSecret))
    kubectl create secret generic twitch-secrets @nsArgs `
            --from-literal=client-id="$twitchClientId" `
            --from-literal=client-secret="$twitchClientSecretPlain" `
            --from-literal=eventsub-secret="$twitchEventSubSecretPlain"
        Write-Host "✓ Twitch secrets created" -ForegroundColor Green
    } else {
        Write-Host "✓ Twitch secrets found" -ForegroundColor Green
    }

    # Discord secrets
    $discordSecretExists = kubectl get secret discord-secrets @nsArgs 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Discord secrets not found. Creating..." -ForegroundColor Cyan
        $discordToken = Read-Host "Enter your Discord Bot Token" -AsSecureString
        $discordTokenPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($discordToken))
    kubectl create secret generic discord-secrets @nsArgs `
            --from-literal=bot-token="$discordTokenPlain"
        Write-Host "✓ Discord secrets created" -ForegroundColor Green
    } else {
        Write-Host "✓ Discord secrets found" -ForegroundColor Green
    }

    # YouTube secrets
    $youtubeSecretExists = kubectl get secret youtube-secrets @nsArgs 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "YouTube secrets not found. Creating..." -ForegroundColor Cyan
        $ytApiKey = Read-Host "Enter your YouTube Data API key" -AsSecureString
        $ytApiKeyPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($ytApiKey))
        $ytWebhookSecret = Read-Host "Enter your YouTube WebSub Secret (optional, press Enter to skip)" -AsSecureString
        $ytWebhookSecretPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($ytWebhookSecret))
        if (-not $ytWebhookSecretPlain) { $ytWebhookSecretPlain = "" }
    kubectl create secret generic youtube-secrets @nsArgs `
            --from-literal=youtube-api-key="$ytApiKeyPlain" `
            --from-literal=webhook-secret="$ytWebhookSecretPlain"
        Write-Host "✓ YouTube secrets created" -ForegroundColor Green
    } else {
        Write-Host "✓ YouTube secrets found" -ForegroundColor Green
    }

    # Database secrets
    $databaseSecretExists = kubectl get secret database-secrets @nsArgs 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Database secrets not found. Creating..." -ForegroundColor Cyan
        $dbPassword = Read-Host "Enter your PostgreSQL password" -AsSecureString
        $dbPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPassword))
        $dbUser = Read-Host "Enter your PostgreSQL user" -AsSecureString
        $dbUserPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbUser))
        $dbName = Read-Host "Enter your PostgreSQL database name" -AsSecureString
        $dbNamePlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbName))
        $dbConnectionName = Read-Host "Enter your PostgreSQL connection name" -AsSecureString
        $dbConnectionNamePlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbConnectionName))
    kubectl create secret generic database-secrets @nsArgs `
            --from-literal=postgres-password="$dbPasswordPlain" `
            --from-literal=postgres-user="$dbUserPlain" `
            --from-literal=postgres-db="$dbNamePlain" `
            --from-literal=instanceConnectionName="$dbConnectionNamePlain"
        Write-Host "✓ Database secrets created" -ForegroundColor Green
    } else {
        Write-Host "✓ Database secrets found" -ForegroundColor Green
    }

    # Service Account
    $serviceAccountExists = kubectl get secret paintbot-service-account @nsArgs 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Service account secret not found. Creating..." -ForegroundColor Cyan
        $keyPath = Read-Host "Enter path to your service account key.json file"
        if (Test-Path $keyPath) {
            kubectl create secret generic paintbot-service-account @nsArgs `
                --from-file=key.json="$keyPath"
            Write-Host "✓ Service account secret created" -ForegroundColor Green
        } else {
            Write-Host "Service account key file not found at: $keyPath" -ForegroundColor Red
        }
    } else {
        Write-Host "✓ Service account secret found" -ForegroundColor Green
    }

    Write-Host "" -ForegroundColor Green
    Write-Host "All secrets are configured!" -ForegroundColor Green
    Write-Host "You can now run '.\deploy.ps1 deploy' to deploy your application." -ForegroundColor Cyan
    return $true
}

# Main script logic
switch ($Command.ToLower()) {
    "setup" {
        Setup-GKE
    }
    "create-secrets" {
    # Pass the optional namespace (provided as the second CLI arg) through to the helper
    Setup-And-Create-Secrets -Namespace $Service
    }
    "build" {
        Build-Images
    }
    "push" {
        Push-Images
    }
    "deploy" {
        Deploy-ToGKE
    }
    "deploy-build" {
        Build-Images
        Push-Images
        Deploy-ToGKE
    }
    "deploy-dev" {
        Deploy-Dev
    }
    "deploy-build-dev" {
        Build-Images
        Push-Images
        Deploy-Dev
    }
    "status" {
        Check-Status
    }
    "logs" {
        Show-Logs -ServiceName $Service
    }
    "cleanup" {
        Cleanup
    }
    default {
        Print-Usage
    }
}
