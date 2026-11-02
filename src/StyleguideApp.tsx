import StyleguideLayout from '../app/styleguide/layout'
import StyleguidePage from '../app/styleguide/page'

export default function StyleguideApp({ path }: { path: string }) {
  return <StyleguideLayout pathname={path}><StyleguidePage /></StyleguideLayout>
}
