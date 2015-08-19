var d3; // defined by import
var num_frets = 7;

/*
  fret=0 is an open string
  fret=1 is the first fret on each string (one semitone above an open string)
  string=1 is the lowest string (low E, bottom of screen, thickest line)
  string=6 is the higest string. 123456=EADGBE
  finger(fret,string) is where the dot goes, where your finger would go
  label(fret,string) is offset below and to the right, where text goes

  [ f0 ]|[ f1 ]|[ f2 ]|  : num_frets=3, total = x_space*(num_frets+1)

*/

var preferred_chord_fingerings = { // ->[low-to-high]
    E: [0,2,2,1,0,0],
    A: ["X",0,2,2,2,0],
    D: ["X","X",0,2,3,2],
    Em: [0,2,2,0,0,0],
    Am: ["X",0,2,2,1,0],
    F: ["X","X",3,2,1,1],
    C: ["X",3,2,0,1,0],
    G: ["X","X",5,4,3,3],
    Dm: ["X","X",0,2,3,1],
    Fm: ["X","X",3,1,1,1],
    Gm: ["X","X",5,3,3,3],
};

var use_flats;
var scale; // E major
var current_chord_name = "E";
var current_chord_chromatic_degrees = [0,4,7];
var current_chord_major_degrees = [1,3,5]; // major-scale degrees
var current_preferred_fingering = preferred_chord_fingerings.E;

var major_scale_colors = { // sampled from iBooks Hooktheory
    0: "rgba(255,255,255,0.5)",
    1: "#F33C27", // red
    2: "#FEAB3A", // orange
    3: "#F2DF3E", // yellow
    4: "#5BC92F", // green
    5: "#234CF7", // blue
    6: "#A551DF", // purple
    7: "#F300C8" // sorta pink/magenta-ish
};


//var chromatic_scale_to_major_scale_degree {

function mod12(n) {
    // why is -2%12==-2 in JS?
    return (n%12+12)%12;
}

// note=0 is the low E on string=1
// chromatic_scale=0 is a C, 4=E,5=F,7=G,11=B
function note_to_chromatic_scale(note) {
    return mod12(note+4);
}

// note=0 is E2. scale=0 is C major. scale=1 is C# major.
function note_to_major_scale_degree(note, scale) {
    // returns 1-7 for notes that are in the scale, 0 for non-scale
    var chromatic_degree = mod12(note+4-scale);
    return {0: 1, 1:0,
            2: 2, 3:0,
            4: 3,
            5: 4, 6:0,
            7: 5, 8:0,
            9: 6, 10:0,
            11: 7}[chromatic_degree];
}

function chromatic_scale_to_name(chromatic_scale, use_flats) {
    if (use_flats)
        return {0:"C", 1:"Db", 2:"D", 3:"Eb", 4:"E", 5:"F",
                6:"Gb", 7:"G", 8:"Ab", 9:"A", 10:"Bb", 11:"B"
               }[chromatic_scale];
    else
        return {0:"C", 1:"C#", 2:"D", 3:"D#", 4:"E", 5:"F",
                6:"F#", 7:"G", 8:"G#", 9:"A", 10:"A#", 11:"B"
               }[chromatic_scale];
}

function major_scale_degree_to_chromatic_scale(degree, scale) {
    var n = scale + {1:0, 2:2, 3:4, 4:5, 5:7, 6:9, 7:11}[degree];
    return mod12(n);
}

function major_degree_to_name(degree, scale, use_flats) {
    var cs = major_scale_degree_to_chromatic_scale(degree, scale);
    return chromatic_scale_to_name(cs, use_flats);
}

// note=0 is E2. each octave starts at C and extends upwards through B.
function note_to_octave(note) {
    return Math.floor((note+4)/12) + 2;
}


function note_to_fullname(note, use_flats) {
    var name = chromatic_scale_to_name(note_to_chromatic_scale(note),use_flats);
    var octave = note_to_octave(note);
    return name+octave;
}

var open_string_notes = {
    1: 0, // E2
    2: 5, // A2
    3: 10, // D3
    4: 15, // G3
    5: 19, // B3
    6: 24 // E4
};



function string_and_fret_to_note(string, fret) {
    return open_string_notes[string] + fret;
}

function draw_frets() {
    d3.select("svg#svg").remove();
    d3.select("div#main").append("svg")
        .attr("id", "svg")
        .attr("height", "400")
        .attr("width", "100%");
    var svg = d3.select("#svg");
    var w = Number(svg.style("width").slice(0,-2));
    console.log(w);
    var stringY = d3.scale.linear().domain([6,1]).range([15,200]);
    var x_space = w/(num_frets+1);
    var half_space = x_space/2;
    // this draws the frets
    var fretX = d3.scale.linear()
            .domain([0,num_frets-1])
            .range([x_space,w-x_space]);
    var finger_offset = w/num_frets/2;
    // this is where the finger spots are, between the frets
    var fingerX = d3.scale.linear()
            .domain([0,num_frets-1])
            .range([half_space,w-x_space-half_space]);
    for (var i=0; i<num_frets; i++) {
        svg.append("line").attr("class", "fret")
            .attr("x1", fretX(i)).attr("y1", stringY(0.5))
            .attr("x2", fretX(i)).attr("y2", stringY(6.5));
    }
    var g = svg.selectAll("g.string")
            .data([1,2,3,4,5,6])
            .enter().append("g")
            .attr("class", "string");
    g.append("line")
        .attr("class", "string")
        .attr("x1", fretX(-0.1)).attr("y1", stringY)
        .attr("x2", fretX(num_frets-0.2)).attr("y2", stringY)
        .style("stroke-width", function(d) { return (7-d)+"px"; })
        .style("stroke", "black");
    var mutes = [];
    for (var j=1; j<=6; j++) {
        if (current_preferred_fingering &&
            current_preferred_fingering[j-1] == "X")
            mutes.push([j,true]);
        else
            mutes.push([j,false]);
    }
    svg.selectAll("text.mute").data(mutes).enter()
        .append("text").attr("class", "mute")
        .attr("x", x_space)
        .attr("y", function(d) {return stringY(d[0])+10;})
        .style("font-size", "200%")
        .style("visibility", function(d) {
            if (d[1])
                return "visible";
            else
                return "hidden";
               })
        .text("X");
    var spots = [];
    for (var i=0; i<num_frets; i++) {
        for (var j=1; j<=6; j++) {
            var note = string_and_fret_to_note(j, i);
            var major_degree = note_to_major_scale_degree(note, scale);
            var spot = {string: j, fret: i,
                        note: note,
                        fullname: note_to_fullname(note, use_flats),
                        major_degree: major_degree,
                        color: major_scale_colors[major_degree]
                       };
            if (current_preferred_fingering &&
                current_preferred_fingering[j-1] == i)
                spot.in_fingering = true;
            spots.push(spot);
        }
    }
    svg.selectAll("circle.finger").data(spots).enter()
        .append("circle").attr("class", "finger")
        .attr("cx", function(d) {return fingerX(d.fret);})
        .attr("cy", function(d) {return stringY(d.string);})
        .attr("r", function(d) {
            if (current_chord_major_degrees.indexOf(d.major_degree) == 0)
                return 15;
            if (current_chord_major_degrees.indexOf(d.major_degree) == 1)
                return 12;
            return 10;
        })
        .attr("fill", function(d) {return d.color;})
        .style("visibility", function(d) {
            if (current_chord_major_degrees.indexOf(d.major_degree) != -1)
                return "visible";
            else
                return "hidden";
               })
        .attr("stroke", function(d) {
            if (d.in_fingering)
                return "#000";
            else
                return "rgba(150,150,150,0.5)";
        })
        .attr("stroke-width", function(d) {
            if (d.in_fingering)
                return "4px";
            return "2px";
        })
    ;
    svg.selectAll("text.label").data(spots).enter()
        .append("svg:text").attr("class", "label")
        .attr("x", function(d) {return fingerX(d.fret)+0.2*half_space;})
        .attr("y", function(d) {return stringY(d.string)+17;})
        .text(function(d) {return d.fullname;});
}

function draw_scale_chooser() {
    var scales = [
        [-6, "Gb", true],
        [-5, "Db", true],
        [-4, "Ab", true],
        [-3, "Eb", true],
        [-2, "Bb", true],
        [-1, "F", true],
        [0, "C", false],
        [1, "G", false],
        [2, "D", false],
        [3, "A", false],
        [4, "E", false],
        [5, "B", false],
    ];
    var r = 50;
    d3.select("div#scale svg").remove();
    var svg = d3.select("div#scale").append("svg");
    svg.attr("height", r*3).attr("width", r*4);
    var groups = svg.selectAll("g.scale").data(scales)
            .enter().append("svg:g")
            .attr("class", "scale")
            .attr("transform", function(d) {
                var x = Math.round(2*r+r*Math.sin(d[0]/3*Math.PI/2));
                var y = Math.round(1*r-r*Math.cos(d[0]/3*Math.PI/2));
                return "translate("+x+","+y+")";
            })
            .on("click", select_scale)
    ;
    var rects = groups.append("svg:rect")
            .attr("class", function(d) {return "scale-indicator "
                                        +"scale-indicator-"+d[0];})
            .attr("height", "1em")
            .attr("width", function(d) {
                if (d[1].length == 1) return "1em";
                else return "1.5em";
            })
            .attr("fill", "#eee")
            .attr("stroke-width", "2px")
    ;
    groups.append("svg:text").text(function(d) {return d[1];})
        .attr("dy", "0.9em").attr("dx", "0.1em")
    ;
}

function select_scale(d) {
    d3.selectAll("rect.scale-indicator").attr("stroke", "#fff");
    d3.selectAll("rect.scale-indicator-"+d[0]).attr("stroke", "#000");
    scale = mod12(d[0]*7);
    use_flats = d[2];
    select_chord(["I", [1,3,5], ""]);
    update_chord_chooser();
    draw_frets();
}

function draw_chord_chooser() {
    var chords = [
        ["I", [1,3,5], ""],
        ["ii", [2,4,6], "m"],
        ["iii", [3,5,7], "m"],
        ["IV", [4,6,1], ""],
        ["V", [5,7,2], ""],
        ["vi", [6,1,3], "m"],
    ];
    var w = 50;
    d3.select("div#chord svg").remove();
    var svg = d3.select("div#chord").append("svg");
    svg.attr("height", 100).attr("width", chords.length*w);
    var groups = svg.selectAll("g.chord").data(chords)
            .enter().append("svg:g")
            .attr("class", "scale")
            .attr("transform", function(d,i) {
                var x = i*w;
                return "translate("+x+",0)";
            })
            .on("click", select_chord)
    ;
    var rects = groups.append("svg:rect")
            .attr("class", function(d) {return "chord-indicator "
                                        +"chord-indicator-"+d[0];})
            .attr("height", "1.2em")
            .attr("width", function(d) {
                return (1 + 0.5*(d[1].length-1) + "em");
            })
            .attr("fill", function(d){return major_scale_colors[d[1][0]];})
            .attr("stroke-width", "2px")
    ;
    groups.append("svg:text")
        .attr("class", "chord-buttons")
        .text(function(d) {return d[0];})
        .attr("text-anchor", "middle")
        .attr("dy", "1.0em").attr("dx", "1em")
    ;
    groups.append("svg:text")
        .attr("class", "chord-roots")
        .text("??")
        .attr("text-anchor", "middle")
        .attr("dy", "2.2em").attr("dx", "1em")
    ;
    groups.append("svg:text")
        .attr("class", "chord-quality")
        .text("?")
        .attr("text-anchor", "middle")
        .attr("dy", "3.4em").attr("dx", "1em")
    ;
}

function update_chord_chooser() {
    var t = d3.selectAll("div#chord svg text.chord-roots");
    t.text(function(d) {
        return major_degree_to_name(d[1][0], scale, use_flats) + d[2];
    });
    t = d3.selectAll("div#chord svg text.chord-quality");
    t.text(function(d) {
        var name = major_degree_to_name(d[1][0], scale, use_flats) + d[2];
        var fingering = preferred_chord_fingerings[name];
        if (fingering)
            return "+";
        return "?";
    });
}

function select_chord(d) {
    d3.selectAll("rect.chord-indicator").attr("stroke", "#fff");
    d3.selectAll("rect.chord-indicator-"+d[0]).attr("stroke", "#000");
    var name = major_degree_to_name(d[1][0], scale, use_flats) + d[2];
    current_chord_name = name;
    current_chord_major_degrees = d[1];
    current_chord_chromatic_degrees = d[1].map(function(mdeg) {
        return major_scale_degree_to_chromatic_scale(mdeg, scale);
    });
    current_preferred_fingering = preferred_chord_fingerings[name];
    draw_frets();
}

function main() {
    draw_scale_chooser();
    select_scale([4, "E", false]);
    draw_chord_chooser();
    select_chord(["I", [1,3,5]]);
    update_chord_chooser();
    draw_frets();
}

main();
window.addEventListener("resize", draw_frets);

