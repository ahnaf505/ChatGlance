# ChatGlance - WhatsApp Chat Analyzer 📊

ChatGlance is a web application that analyzes your WhatsApp chat exports to provide insightful statistics and visualizations about your conversations.

## Features ✨

- **Top Words Analysis**: See the most frequently used words by each participant
- **Emoji Usage**: Discover each person's most used emoji
- **Response Times**: Analyze how quickly each person typically replies
- **Conversation Starters**: Identify common ways each person initiates chats
- **Chat Duration**: View the total time span of your conversation
- **Message Statistics**: See total messages, sessions, and averages

## Screenshots 📸

![Upload Page](notimplemented)
![Analysis Dashboard](notimplemented)

## Getting Started 🚀

### Using the Live Version

1. Export your WhatsApp chat (see [Tutorial](https://chatglance.ahnaf.id/tutorial.html))
2. Visit [chatglance.ahnaf.id](https://chatglance.ahnaf.id)
3. Upload your exported chat file
4. View your conversation insights!

Here's an improved version of the **Self-Hosting** section with specific, easy-to-use web server suggestions:

### Self-Hosting

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/chatglance.git
   cd chatglance
   ```

2. **Update the production URLs** in the frontend HTML files:
   - Edit `PROD_UPLOAD_URL` and `PROD_SUMMARY_URL` in both HTML files to point to your backend (e.g., `http://localhost:3000`)

3. **Set up and run the backend**:
   ```bash
   cd backend
   npm install
   node .
   ```

4. **Serve the frontend** (choose one of these simple methods):

   #### 🐍 Python Built-in Server (Easiest)
   ```bash
   # For Python 3 (from the frontend directory)
   python3 -m http.server 8000
   ```
   Then open: `http://localhost:8000`

   #### 🛠️ Node.js `serve` (Great for testing)
   ```bash
   npx serve -p 8000
   ```

   #### 🐹 PHP Built-in Server
   ```bash
   php -S localhost:8000
   ```

   #### 🐘 Live Server (VS Code Extension)
   1. Install the "Live Server" extension in VS Code
   2. Right-click on `index.html` → "Open with Live Server"

   Access the app at: `http://localhost:8000` (or the port you specified)


For production use, consider:
- Nginx/Apache for better performance
- Use a vm or serverless deployment for the backend


## Tech Stack 💻

- **Frontend**: HTML, Tailwind CSS, JavaScript
- **Backend**: Node.js
- **Libraries**: FilePond (file uploads), JSZip (ZIP extraction)

## License 📜

MIT License - see [LICENSE](LICENSE) for details.