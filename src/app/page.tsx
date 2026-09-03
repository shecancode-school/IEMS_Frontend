import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import TornStrip from "@/components/TornEdge";
import MonthCalendar from "@/components/MonthCalendar";
import BookTeam from "@/components/BookTeam";
import CategoryMarquee from "@/components/CategoryMarquee";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <TornStrip />
        <MonthCalendar />
        <BookTeam />
        <CategoryMarquee />
      </main>
      <Footer />
    </>
  );
}
