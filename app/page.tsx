import HomeContent from './HomeContent'

// Server component shell. Reads ?error= once on the server and hands it
// to the client component as a prop — avoids the SSR hazard of touching
// `window.location` during first render.

export default async function Home(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await props.searchParams
  const initialError = typeof sp.error === 'string' ? sp.error : null
  return <HomeContent initialError={initialError} />
}
