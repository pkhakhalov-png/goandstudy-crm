import type { StudentProjectData } from '@/lib/student-project-types'
import type { RoadmapData } from '@/lib/roadmap-types'
import { ProjectStudentCard } from './ProjectStudentCard'
import { RoadmapCard } from './RoadmapCard'

interface Props {
  clientId: number
  project: StudentProjectData
  roadmap: {
    data: RoadmapData
    approvedAt: string | null
    approvedBy: string | null
  }
}

export function ProjectAndRoadmap({ clientId, project, roadmap }: Props) {
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

      <ProjectStudentCard clientId={clientId} initial={project} />
      <RoadmapCard
        clientId={clientId}
        data={roadmap.data}
        approvedAt={roadmap.approvedAt}
        approvedBy={roadmap.approvedBy}
      />
    </div>
  )
}
