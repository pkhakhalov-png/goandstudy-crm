import type { RoadmapStage, StudentProject } from './mock-data'
import { ProjectStudentCard } from './ProjectStudentCard'
import { RoadmapCard } from './RoadmapCard'

interface Props {
  project: StudentProject
  roadmap: RoadmapStage[]
}

export function ProjectAndRoadmap({ project, roadmap }: Props) {
  return (
    <div
      className="project-roadmap-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 20,
        alignItems: 'start',
      }}
    >
      <style>{`
        @media (max-width: 980px) {
          .project-roadmap-grid { grid-template-columns: 1fr !important; }
        }
        .project-roadmap-grid > * { min-width: 0; }
      `}</style>

      <ProjectStudentCard initial={project} />
      <RoadmapCard roadmap={roadmap} />
    </div>
  )
}
