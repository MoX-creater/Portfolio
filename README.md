# Portfolio Website

A modern personal portfolio website built with React, TypeScript, Vite, and Tailwind-inspired styling. It highlights projects, skills, background, and contact information in a polished, developer-focused layout.

## Features

- Responsive single-page portfolio layout
- Project cards with expandable architecture details
- Skills and experience sections
- Resume download CTA
- Social links and contact section

## Tech Stack

- React
- TypeScript
- Vite
- Tailwind CSS via custom styling utilities
- Lucide React icons

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open the local URL shown in the terminal (usually http://localhost:5173).

## Project Structure

- `src/app/App.tsx` — main portfolio page and sections
- `src/app/components/` — reusable UI components
- `public/` — static assets such as the resume PDF

## Notes

- Place your resume PDF in the `public` folder as `resume.pdf` if you want the download button to work.
- Update personal details such as name, email, GitHub, and LinkedIn links in the main app file.
  