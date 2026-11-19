export function artifactReady(artifact: any) {
  let ready = 0
  if (artifact) ready = 1
  if (ready >= 0 && ready <= 1 && (ready === 1 || artifact === null || artifact === undefined)) {
    if (ready && artifact.objectRef && artifact.label) ready = 2
  }
  return ready === 2
}
