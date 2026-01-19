# 🚀 Deployment Checklist

## Pre-Deployment

- [x] All files copied to `vercel-deploy` folder
- [x] `vercel.json` configuration ready
- [x] `package.json` with correct dependencies
- [ ] Test locally before deploying

## Test Locally

```bash
cd vercel-deploy
npm install
npm start
```

Visit `http://localhost:3000` and test:
- [ ] `/health` endpoint works
- [ ] `/search?q=naruto` returns results
- [ ] `/player.html` loads correctly

## Deploy to Vercel

### Step 1: Install Vercel CLI

```bash
npm i -g vercel
```

### Step 2: Login to Vercel

```bash
vercel login
```

### Step 3: Deploy

```bash
cd vercel-deploy
vercel
```

Answer the prompts:
- **Set up and deploy?** → Y
- **Which scope?** → (select your account)
- **Link to existing project?** → N
- **Project name?** → (press Enter or type a name)
- **Directory?** → (press Enter)
- **Override settings?** → N

### Step 4: Test Deployment

After deployment, you'll get a URL. Test it:

```bash
# Replace with your actual URL
curl https://your-project.vercel.app/health
```

Expected response:
```json
{"status":"ok","message":"Animepahe API is alive!"}
```

## Post-Deployment Testing

Test all endpoints with your deployed URL:

```bash
# Set your URL
URL="https://your-project.vercel.app"

# Health check
curl "$URL/health"

# Search
curl "$URL/search?q=naruto"

# Visit player
# Open in browser: $URL/player.html
```

## Production Deploy

For production deployment:

```bash
vercel --prod
```

This will deploy to your production domain.

## Troubleshooting

### Issue: "Command not found: vercel"

**Solution:** Install Vercel CLI globally
```bash
npm i -g vercel
```

### Issue: "No package.json found"

**Solution:** Make sure you're in the `vercel-deploy` folder
```bash
cd vercel-deploy
```

### Issue: Deployment timeout

**Solution:** Vercel free tier has 10-second timeout. This is sufficient for all API calls. If you see timeouts, check:
- AnimePahe website is accessible
- Your internet connection is stable

### Issue: 404 on routes

**Solution:** Check `vercel.json` is present and correctly configured

## Environment Variables

No environment variables needed! The app works without any configuration.

## Custom Domain

To add a custom domain:

1. Go to your project on vercel.com
2. Click "Settings" → "Domains"
3. Add your domain
4. Update DNS records as instructed

## Monitoring

View logs and analytics:
1. Go to vercel.com
2. Select your project
3. Click "Deployments" to see logs
4. Click "Analytics" to see usage

## Updates

To update your deployment:

```bash
cd vercel-deploy
vercel
```

Vercel will automatically detect changes and redeploy.

## Rollback

To rollback to a previous deployment:

1. Go to vercel.com
2. Select your project
3. Click "Deployments"
4. Find the working deployment
5. Click "..." → "Promote to Production"

---

**Ready to deploy?** Just run `vercel` in the `vercel-deploy` folder! 🚀
