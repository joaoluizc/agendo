import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function Component() {
  return (
    <Card className="w-full max-w-md p-6 grid gap-6">
      <div className="flex items-start gap-4">
        <div className="bg-muted rounded-md flex items-center justify-center aspect-square w-12">
          <CalendarIcon className="w-6 h-6" />
        </div>
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold">Weekly Team Meeting</h3>
            <RepeatIcon className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarIcon className="w-4 h-4" />
            <span>July 10, 2024 - 2:00 PM to 3:00 PM</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LocateIcon className="w-4 h-4" />
            <span>Acme Inc. HQ, 123 Main St, Anytown USA</span>
          </div>
        </div>
      </div>
      <p className="text-muted-foreground">
        Join us for our weekly team meeting to discuss project updates, upcoming deadlines, and new initiatives. Please
        come prepared to share your progress and any blockers you're facing.
      </p>
      <div className="flex gap-4">
        <Button variant="link">See more</Button>
        <Button>Join meeting</Button>
      </div>
    </Card>
  )
}

function CalendarIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </svg>
  )
}


function LocateIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="2" x2="5" y1="12" y2="12" />
      <line x1="19" x2="22" y1="12" y2="12" />
      <line x1="12" x2="12" y1="2" y2="5" />
      <line x1="12" x2="12" y1="19" y2="22" />
      <circle cx="12" cy="12" r="7" />
    </svg>
  )
}


function RepeatIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  )
}