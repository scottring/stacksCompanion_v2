# Sappi Product Release Form

This is a form application for handling product releases at Sappi.

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
- Copy `.env.example` to `.env`
- Fill in your email credentials

3. Run the server:
```bash
npm run dev
```

## Deployment

This application can be deployed to Render.com:

1. Create a new Web Service
2. Connect your GitHub repository
3. Set the following:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add environment variables:
   - `EMAIL_USER`
   - `EMAIL_PASS`
   - `PORT`

## API Endpoints

- `GET /health` - Health check endpoint
- `POST /api/create-form` - Create a new form instance
- `POST /api/submit-form` - Submit form data
# stacksCompanion_v2
