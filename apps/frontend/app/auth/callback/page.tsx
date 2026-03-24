import AuthCallbackClient from './AuthCallbackClient';

interface AuthCallbackPageProps {
  searchParams?: {
    next?: string;
    code?: string;
  };
}

export default function AuthCallbackPage({ searchParams }: AuthCallbackPageProps) {
  const nextPath = searchParams?.next || '/';
  const code = searchParams?.code || null;

  return <AuthCallbackClient nextPath={nextPath} code={code} />;
}
