import { Coach } from "@/types/coach";

export const DUMMY_COACHES: Coach[] = [
  {
    id: "1",
    name: "Sarah Jenkins",
    title: "Senior Engineering Manager",
    bio: "Ex-Google engineering leader with 10+ years of experience building high-performing teams. Passionate about helping engineers transition into management roles.",
    specialization: "Tech Leadership",
    image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200&h=200",
    rating: 4.9,
    reviews: 124,
    location: "San Francisco, CA",
    languages: ["English", "Spanish"],
    tags: ["Leadership", "Management", "Career Growth"],
    availability: { timezone: "America/Los_Angeles", weeklySchedule: [] }
  },
  {
    id: "2",
    name: "David Chen",
    title: "Principal Software Engineer",
    bio: "Full-stack architecture expert specializing in scalable systems. I help senior engineers break through the ceiling to staff/principal levels.",
    specialization: "Software Engineering",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=200&h=200",
    rating: 5.0,
    reviews: 89,
    location: "New York, NY",
    languages: ["English", "Mandarin"],
    tags: ["System Design", "Architecture", "Backend"],
    availability: { timezone: "America/New_York", weeklySchedule: [] }
  },
  {
    id: "3",
    name: "Emily Rodriguez",
    title: "Product Strategy Director",
    bio: "Helping product managers and leaders define clear product visions and execution strategies. Previously at Spotify and Airbnb.",
    specialization: "Product Strategy",
    image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=200&h=200",
    rating: 4.8,
    reviews: 215,
    location: "London, UK",
    languages: ["English", "French"],
    tags: ["Product Management", "Strategy", "UX"],
    availability: { timezone: "Europe/London", weeklySchedule: [] }
  },
  {
    id: "4",
    name: "Michael Chang",
    title: "Staff UX Designer",
    bio: "Award-winning designer focused on creating intuitive and accessible user experiences. I mentor designers on portfolio building and design systems.",
    specialization: "UX/UI Design",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200&h=200",
    rating: 4.9,
    reviews: 156,
    location: "Toronto, Canada",
    languages: ["English"],
    tags: ["Design Systems", "Accessibility", "Prototyping"],
    availability: { timezone: "America/Toronto", weeklySchedule: [] }
  }
];
