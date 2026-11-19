export function artifactReady(artifact: any) {
  return Boolean(artifact && artifact.objectRef && artifact.label)
}
