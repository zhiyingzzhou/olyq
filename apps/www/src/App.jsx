import { RouterProvider } from 'react-router-dom'
import { router } from './routes/router.jsx'

function App() {
  return <RouterProvider fallbackElement={<div className="min-h-screen bg-white dark:bg-black" />} router={router} />
}

export default App
