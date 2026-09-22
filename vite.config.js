import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// `base` must match the GitHub Pages sub-path: https://<user>.github.io/My-Trading/
export default defineConfig({
  base: '/My-Trading/',
  plugins: [react()],
})
