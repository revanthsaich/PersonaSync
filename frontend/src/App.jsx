import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';

import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Persons from './pages/Persons';
import PersonDetail from './pages/PersonDetail';
import Gallery from './pages/Gallery';
import Groups from './pages/Groups';
import GroupDetail from './pages/GroupDetail';
import Chat from './pages/Chat';
import Invite from './pages/Invite';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';

// Import key from env
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const ClerkProviderWithRoutes = () => {
  const navigate = useNavigate();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      navigate={(to) => navigate(to)}
    >
      <Routes>
        {/* Public Routes */}
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />
        
        {/* Protected Routes */}
        <Route
          path="/"
          element={
            <>
              <SignedIn>
                <Layout />
              </SignedIn>
              <SignedOut>
                <RedirectToSignIn />
              </SignedOut>
            </>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="gallery" element={<Gallery />} />
          <Route path="persons" element={<Persons />} />
          <Route path="persons/:id" element={<PersonDetail />} />
          <Route path="groups" element={<Groups />} />
          <Route path="groups/:id" element={<GroupDetail />} />
          <Route path="upload" element={<Upload />} />
          <Route path="chat" element={<Chat />} />
          <Route path="invite" element={<Invite />} />
        </Route>
        
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ClerkProvider>
  );
};

const App = () => {
  if (!clerkPubKey) {
    return (
      <div className="h-screen flex items-center justify-center font-sans text-red-600">
        Missing Clerk Publishable Key in .env file
      </div>
    );
  }

  return (
    <BrowserRouter>
      <ClerkProviderWithRoutes />
    </BrowserRouter>
  );
};

export default App;