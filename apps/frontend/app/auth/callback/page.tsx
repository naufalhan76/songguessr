import AuthCallbackClient from './AuthCallbackClient';

interface AuthCallbackPageProps {
  searchParams: Promise<{
    next?: string;
    code?: string;
  }>;
}

export default async function AuthCallbackPage({ searchParams }: AuthCallbackPageProps) {
  const params = await searchParams;
  const nextPath = params?.next || '/';
  const code = params?.code || null;

  return <AuthCallbackClient nextPath={nextPath} code={code} />;
}
